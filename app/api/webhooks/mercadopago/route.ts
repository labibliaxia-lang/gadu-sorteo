import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMercadoPagoPayment,
  verifyWebhookSignature,
} from "@/lib/mercadopago";
import {
  isTerminalPaymentStatus,
  mapMpFailureStatus,
} from "@/lib/payments";

/**
 * Webhook de Mercado Pago.
 * - Verifica la firma HMAC del manifest de MP (x-signature + x-request-id + data.id).
 * - Consulta el pago a la API de MP (fuente de verdad, nunca confía en el body).
 * - Es idempotente: si el pago ya se procesó, no repite acciones.
 * - Solo el service role marca números como "sold" (RPC sell_numbers).
 */
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Solicitud demasiado grande" },
      { status: 413 },
    );
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Solicitud demasiado grande" },
      { status: 413 },
    );
  }
  // MP firma el manifest `id:[data.id];request-id:[x-request-id];ts:[ts];`.
  // `data.id` viaja en el query string de la URL de notificación, no en el body.
  const dataIdFromQuery = request.nextUrl.searchParams.get("data.id");
  const requestId = request.headers.get("x-request-id");

  const verification = (() => {
    try {
      return verifyWebhookSignature({
        xSignature: request.headers.get("x-signature"),
        xRequestId: requestId,
        dataId: dataIdFromQuery,
      });
    } catch (error) {
      console.error("Webhook MP: error verificando firma", error);
      return { ok: false as const, reason: "ValidatorError" };
    }
  })();

  if (!verification.ok) {
    console.error(
      `Webhook MP: firma inválida (${verification.reason}) request-id=${
        requestId ?? "sin header"
      }`,
    );
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

  // `data.id` puede venir en el body o solo en el query de la notificación.
  const rawId = payload.data?.id ?? dataIdFromQuery;
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
  if (isTerminalPaymentStatus(payment.status)) {
    return NextResponse.json({ received: true });
  }

  // null cuando el pago sigue en curso: en ese caso no se tocan los números.
  const failureStatus = mapMpFailureStatus(mpStatus);

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
      return NextResponse.json(
        { error: "Error interno procesando la solicitud" },
        { status: 500 },
      );
    }

    await admin
      .from("payments")
      .update({ status: "approved", mp_payment_id: String(paymentId) })
      .eq("id", payment.id);

    // Referidos: otorga un número gratis al referente (atómico e idempotente).
    const { data: referral } = await admin
      .from("referrals")
      .select("id")
      .eq("referred_id", payment.user_id)
      .eq("rewarded", false)
      .maybeSingle();

    if (referral) {
      const { error: rewardError } = await admin.rpc("reward_referral", {
        p_referral_id: referral.id,
        p_raffle_id: payment.raffle_id,
      });
      if (rewardError) {
        console.error("Webhook MP: error al recompensar referido", rewardError);
      }
    }
  } else if (failureStatus) {
    // Libera los números reservados.
    await admin.rpc("release_numbers", {
      p_raffle_id: payment.raffle_id,
      p_numbers: payment.numbers,
      p_user_id: payment.user_id,
    });

    await admin
      .from("payments")
      .update({ status: failureStatus, mp_payment_id: String(paymentId) })
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
