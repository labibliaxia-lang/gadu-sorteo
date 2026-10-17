import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMercadoPagoPayment,
  verifyWebhookSignature,
} from "@/lib/mercadopago";

const TERMINAL_STATUSES = new Set([
  "approved",
  "rejected",
  "cancelled",
  "refunded",
  "charged_back",
  "expired",
]);

/**
 * Webhook de Mercado Pago.
 * - Verifica firma HMAC (x-signature).
 * - Consulta el pago a la API de MP (fuente de verdad, nunca confía en el body).
 * - Es idempotente: si el pago ya se procesó, no repite acciones.
 * - Solo el service role marca números como "sold" (RPC sell_numbers).
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature") ?? "";

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error("Webhook MP: firma inválida");
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let payload: {
    type?: string;
    action?: string;
    data?: { id?: string | number };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Mercado Pago puede notificar "payment", "merchant_order", "plan", etc.
  if (payload.type && payload.type !== "payment") {
    return NextResponse.json({ received: true });
  }

  const rawId = payload.data?.id;
  const paymentId = typeof rawId === "number" ? rawId : Number(rawId);
  if (!rawId || Number.isNaN(paymentId)) {
    return NextResponse.json({ error: "Sin payment id" }, { status: 400 });
  }

  // Consulta el pago a la API de MP (fuente de verdad).
  let mpPayment: {
    status?: string;
    external_reference?: string | null;
  };
  try {
    const res = await getMercadoPagoPayment(paymentId);
    mpPayment = res as typeof mpPayment;
  } catch (e) {
    console.error("Webhook MP: error consultando pago", e);
    return NextResponse.json(
      { error: "Error consultando Mercado Pago" },
      { status: 502 },
    );
  }

  const externalReference = mpPayment.external_reference;
  if (!externalReference) {
    console.warn("Webhook MP: pago sin external_reference", paymentId);
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();

  const { data: payment, error: paymentError } = await admin
    .from("payments")
    .select("*")
    .eq("id", externalReference)
    .maybeSingle();

  if (paymentError || !payment) {
    console.warn("Webhook MP: registro no encontrado", externalReference);
    return NextResponse.json({ received: true });
  }

  const mpStatus = mpPayment.status ?? "pending";

  // Idempotencia: si ya está en estado terminal, no repetir acciones.
  if (TERMINAL_STATUSES.has(payment.status)) {
    return NextResponse.json({ received: true });
  }

  if (mpStatus === "approved") {
    // Transición atómica reserved -> sold. Es idempotente: si ya se vendieron,
    // el UPDATE no afecta filas (devuelve 0) y no hay doble venta.
    const { error: sellError } = await admin.rpc("sell_numbers", {
      p_raffle_id: payment.raffle_id,
      p_user_id: payment.user_id,
      p_numbers: payment.numbers,
      p_payment_id: payment.id,
    });

    if (sellError) {
      console.error("Webhook MP: error al vender números", sellError);
      return NextResponse.json({ error: sellError.message }, { status: 500 });
    }

    await admin
      .from("payments")
      .update({ status: "approved", mp_payment_id: String(paymentId) })
      .eq("id", payment.id);
  } else if (
    mpStatus === "rejected" ||
    mpStatus === "cancelled" ||
    mpStatus === "refunded" ||
    mpStatus === "charged_back"
  ) {
    // Libera los números reservados.
    await admin.rpc("release_numbers", {
      p_raffle_id: payment.raffle_id,
      p_numbers: payment.numbers,
      p_user_id: payment.user_id,
    });

    const finalStatus =
      mpStatus === "rejected" || mpStatus === "refunded" || mpStatus === "charged_back"
        ? "rejected"
        : "cancelled";

    await admin
      .from("payments")
      .update({ status: finalStatus, mp_payment_id: String(paymentId) })
      .eq("id", payment.id);
  } else {
    // pending / in_process / authorized / in_mediation: no tocar números.
    await admin
      .from("payments")
      .update({ mp_payment_id: String(paymentId) })
      .eq("id", payment.id);
  }

  return NextResponse.json({ received: true });
}
