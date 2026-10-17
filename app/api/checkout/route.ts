import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPreference } from "@/lib/mercadopago";

const checkoutSchema = z.object({
  raffleId: z.string().uuid("Sorteo inválido"),
  numbers: z
    .array(z.number().int().min(1).max(10000))
    .min(1, "Elegí al menos un número")
    .max(100, "Máximo 100 números por compra"),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  const { raffleId, numbers } = parsed.data;
  const uniqueNumbers = Array.from(new Set(numbers));

  // 1) Usuario autenticado
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Debes iniciar sesión para participar" },
      { status: 401 },
    );
  }

  // 2) Sorteo activo y precio
  const { data: raffle, error: raffleError } = await supabase
    .from("raffles")
    .select("id, title, status, price_per_number")
    .eq("id", raffleId)
    .single();

  if (raffleError || !raffle) {
    return NextResponse.json({ error: "Sorteo no encontrado" }, { status: 404 });
  }
  if (raffle.status !== "active") {
    return NextResponse.json(
      { error: "El sorteo no está activo" },
      { status: 409 },
    );
  }

  const pricePerNumber = Number(raffle.price_per_number);

  // 3) Reserva atómica (solo los que estén disponibles). El RPC usa auth.uid().
  const { data: reserved, error: reserveError } = await supabase.rpc(
    "reserve_numbers",
    { p_raffle_id: raffleId, p_numbers: uniqueNumbers },
  );

  if (reserveError) {
    return NextResponse.json({ error: reserveError.message }, { status: 400 });
  }

  const reservedNumbers: number[] = (reserved as number[]) ?? [];

  if (reservedNumbers.length !== uniqueNumbers.length) {
    const reservedSet = new Set(reservedNumbers);
    const unavailable = uniqueNumbers.filter((n) => !reservedSet.has(n));
    return NextResponse.json(
      {
        error: "Algunos números ya no están disponibles.",
        unavailable,
      },
      { status: 409 },
    );
  }

  // 4) Registro del pago en estado "pending"
  const amount = Math.round(reservedNumbers.length * pricePerNumber * 100) / 100;

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      user_id: user.id,
      raffle_id: raffleId,
      numbers: reservedNumbers,
      amount,
      status: "pending",
    })
    .select()
    .single();

  if (paymentError || !payment) {
    // Rollback: liberar lo reservado si no se pudo registrar el pago.
    await createAdminClient().rpc("release_numbers", {
      p_raffle_id: raffleId,
      p_numbers: reservedNumbers,
      p_user_id: user.id,
    });
    return NextResponse.json(
      { error: "No se pudo registrar el pago" },
      { status: 500 },
    );
  }

  // 5) Preferencia de Checkout Pro
  const baseUrl = process.env.NEXT_PUBLIC_URL ?? request.nextUrl.origin;

  try {
    const preference = await createPreference({
      items: [
        {
          id: raffle.id,
          title: `${raffle.title} — ${reservedNumbers.length} número(s)`,
          quantity: 1,
          unit_price: amount,
          currency_id: "ARS",
        },
      ],
      externalReference: payment.id,
      payerEmail: user.email ?? "",
      backUrls: {
        success: `${baseUrl}/pago/exitoso`,
        failure: `${baseUrl}/pago/fallido`,
        pending: `${baseUrl}/pago/pendiente`,
      },
      notificationUrl: `${baseUrl}/api/webhooks/mercadopago`,
    });

    // Guarda el id de la preferencia (service role, omite RLS).
    await createAdminClient()
      .from("payments")
      .update({ mp_preference_id: preference.id })
      .eq("id", payment.id);

    return NextResponse.json({
      init_point: preference.init_point ?? preference.sandbox_init_point,
    });
  } catch (e) {
    console.error("Error creando preferencia MP:", e);
    // Liberar reservas si falla la creación de la preferencia.
    await createAdminClient().rpc("release_numbers", {
      p_raffle_id: raffleId,
      p_numbers: reservedNumbers,
      p_user_id: user.id,
    });
    await createAdminClient()
      .from("payments")
      .update({ status: "cancelled" })
      .eq("id", payment.id);

    return NextResponse.json(
      { error: "No se pudo iniciar el pago. Intentá de nuevo." },
      { status: 502 },
    );
  }
}
