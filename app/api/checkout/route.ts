import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPreference } from "@/lib/mercadopago";
import { computeAmount } from "@/lib/payments";
import { limitCheckout, retryAfterSeconds } from "@/lib/ratelimit";

const checkoutSchema = z.object({
  raffleId: z.string().uuid("Sorteo inválido"),
  numbers: z
    .array(z.number().int().min(1).max(10000))
    .min(1, "Elegí al menos un número")
    .max(100, "Máximo 100 números por compra"),
});

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

/** Credenciales reales de Mercado Pago. `TEST` y `mock` son marcadores de prueba. */
function hasMpCredentials(): boolean {
  const token = process.env.MP_ACCESS_TOKEN?.trim();
  return Boolean(token) && token !== "TEST" && token !== "mock";
}

function isLocalHost(request: NextRequest): boolean {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const hostname = host.startsWith("[")
    ? host.slice(0, host.indexOf("]") + 1)
    : host.split(":")[0];
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

/**
 * Pago simulado: SOLO desarrollo, con flag explícita, host local y sin
 * credenciales. En producción, sin credenciales se falla cerrado (503).
 */
function isMockMode(request: NextRequest): boolean {
  return (
    !IS_PRODUCTION &&
    !hasMpCredentials() &&
    process.env.ENABLE_MOCK_PAYMENTS === "true" &&
    isLocalHost(request)
  );
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Solicitud demasiado grande" },
      { status: 413 },
    );
  }

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

  const rateLimit = await limitCheckout(user.id);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Esperá un minuto e intentá de nuevo." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds(rateLimit)) },
      },
    );
  }

  // Sin credenciales fuera de desarrollo no hay cobro posible: fallar cerrado
  // antes de reservar, para no dejar reservas huérfanas.
  const mockMode = isMockMode(request);
  if (!mockMode && !hasMpCredentials()) {
    console.error(
      "Checkout: MP_ACCESS_TOKEN no configurado en producción. Cobro deshabilitado.",
    );
    return NextResponse.json(
      { error: "El cobro no está disponible en este momento." },
      { status: 503 },
    );
  }

  // 2) Sorteo activo y precio
  const { data: raffle, error: raffleError } = await supabase
    .from("raffles")
    .select("id, title, status, price_per_number, payment_type")
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
  if (raffle.payment_type === "transferencia") {
    return NextResponse.json(
      { error: "Este sorteo se paga por transferencia bancaria" },
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
    console.error("Checkout: error reservando números", reserveError);
    return NextResponse.json(
      { error: "Error interno procesando la solicitud" },
      { status: 400 },
    );
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
  const amount = computeAmount(reservedNumbers.length, pricePerNumber);

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

  // 4b) Modo mock: solo en desarrollo y sin credenciales, aprueba localmente.
  if (mockMode) {
    const admin = createAdminClient();
    const { error: sellError } = await admin.rpc("sell_numbers", {
      p_raffle_id: raffleId,
      p_user_id: user.id,
      p_numbers: reservedNumbers,
      p_payment_id: payment.id,
    });

    if (sellError) {
      console.error("Checkout mock: error vendiendo números", sellError);
      await admin.rpc("release_numbers", {
        p_raffle_id: raffleId,
        p_numbers: reservedNumbers,
        p_user_id: user.id,
      });
      await admin.from("payments").delete().eq("id", payment.id);
      return NextResponse.json(
        { error: "Error interno procesando la solicitud" },
        { status: 500 },
      );
    }

    await admin
      .from("payments")
      .update({ status: "approved", mp_preference_id: "mock" })
      .eq("id", payment.id);

    return NextResponse.json({
      mock: true,
      init_point: "/pago/exitoso?mock=true",
    });
  }

  // 5) Preferencia de Checkout Pro
  const configuredBaseUrl = process.env.NEXT_PUBLIC_URL?.trim();
  if (IS_PRODUCTION && !configuredBaseUrl) {
    console.error(
      "Checkout: NEXT_PUBLIC_URL no configurada; se cancela la creación de la preferencia.",
    );
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
      { error: "El cobro no está disponible en este momento." },
      { status: 503 },
    );
  }

  const baseUrl = configuredBaseUrl ?? request.nextUrl.origin;

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
