import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const mockSchema = z.object({
  raffleId: z.string().uuid("Sorteo inválido"),
  numbers: z
    .array(z.number().int().min(1).max(10000))
    .min(1, "Elegí al menos un número")
    .max(100, "Máximo 100 números por compra"),
});

/**
 * Mock Payment — SOLO DESARROLLO.
 * Simula un pago aprobado: reserva los números, inserta el pago como
 * "approved" y pasa los números de "reserved" a "sold" usando el service role.
 */
export async function POST(request: NextRequest) {
  // 🔒 Bloqueo estricto: nunca disponible en producción.
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "No disponible fuera de desarrollo" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = mockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  const { raffleId, numbers } = parsed.data;
  const uniqueNumbers = Array.from(new Set(numbers));

  // 1) Usuario autenticado.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Debes iniciar sesión" },
      { status: 401 },
    );
  }

  // 2) Sorteo activo y precio.
  const { data: raffle, error: raffleError } = await supabase
    .from("raffles")
    .select("id, price_per_number, status")
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

  // 3) Reservar para el usuario autenticado (reserve_numbers usa auth.uid()).
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
      { error: "Algunos números ya no están disponibles.", unavailable },
      { status: 409 },
    );
  }

  const amount =
    Math.round(reservedNumbers.length * Number(raffle.price_per_number) * 100) /
    100;

  const admin = createAdminClient();

  // 4) Insertar pago como aprobado.
  const { data: payment, error: paymentError } = await admin
    .from("payments")
    .insert({
      user_id: user.id,
      raffle_id: raffleId,
      numbers: reservedNumbers,
      amount,
      status: "approved",
      mp_preference_id: "mock",
    })
    .select()
    .single();

  if (paymentError || !payment) {
    await admin.rpc("release_numbers", {
      p_raffle_id: raffleId,
      p_numbers: reservedNumbers,
      p_user_id: user.id,
    });
    return NextResponse.json(
      { error: "No se pudo registrar el pago simulado" },
      { status: 500 },
    );
  }

  // 5) Transición atómica reserved -> sold (service role).
  const { error: sellError } = await admin.rpc("sell_numbers", {
    p_raffle_id: raffleId,
    p_user_id: user.id,
    p_numbers: reservedNumbers,
    p_payment_id: payment.id,
  });

  if (sellError) {
    // Rollback: liberar reservas y borrar el pago simulado.
    await admin.rpc("release_numbers", {
      p_raffle_id: raffleId,
      p_numbers: reservedNumbers,
      p_user_id: user.id,
    });
    await admin.from("payments").delete().eq("id", payment.id);
    return NextResponse.json({ error: sellError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, paymentId: payment.id });
}
