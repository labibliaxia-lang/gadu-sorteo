import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMercadoPagoPayment,
  resolveWebhookPaymentId,
  verifyWebhookSignature,
  type MercadoPagoPaymentResult,
} from "@/lib/mercadopago";
import {
  amountMatches,
  isReversalStatus,
  isTerminalPaymentStatus,
  mapMpFailureStatus,
} from "@/lib/payments";
import {
  getClientIp,
  limitWebhook,
  retryAfterSeconds,
} from "@/lib/ratelimit";

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

  // Se limita después de validar la firma: así el tráfico no autenticado no
  // consume la cuota de Mercado Pago y no se bloquean notificaciones legítimas.
  const rateLimit = await limitWebhook(getClientIp(request.headers));
  if (!rateLimit.success) {
    console.warn("Webhook MP: rate limit alcanzado", {
      requestId,
    });
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds(rateLimit)) },
      },
    );
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

  // El `data.id` firmado es el del query; el del cuerpo NO está firmado. Se usa
  // el firmado y solo se cae al del cuerpo si el query no lo trae (hallazgo #10).
  const resolved = resolveWebhookPaymentId(dataIdFromQuery, payload.data?.id);
  if (!resolved) {
    return NextResponse.json({ error: "Sin payment id" }, { status: 400 });
  }
  if (resolved.mismatch) {
    console.warn(
      "Webhook MP: el data.id del cuerpo no coincide con el firmado; se procesa el firmado",
    );
  }
  const paymentId = resolved.id;

  // Consulta el pago a la API de MP (fuente de verdad). El tipo compartido
  // incluye importe y moneda, que hacen falta para conciliar (hallazgo #9).
  let mpPayment: MercadoPagoPaymentResult;
  try {
    mpPayment = await getMercadoPagoPayment(paymentId);
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

  // Devolución o contracargo: el dinero vuelve al comprador.
  const isReversal = isReversalStatus(mpStatus);

  // Idempotencia: si el pago ya está en un estado final no se repite nada. La
  // única excepción es `approved` con devolución o contracargo, que tiene que
  // bajar de estado: si no, quien paga con una tarjeta robada se queda con los
  // números gratis cuando le revierten el cargo.
  if (isTerminalPaymentStatus(payment.status)) {
    if (!(payment.status === "approved" && isReversal)) {
      return NextResponse.json({ received: true });
    }
  }

  // 1) Baja de estado por devolución/contracargo de un pago ya aprobado.
  if (payment.status === "approved" && isReversal) {
    await admin
      .from("payments")
      .update({ status: mpStatus, mp_payment_id: String(paymentId) })
      .eq("id", payment.id);

    const { data: raffle } = await admin
      .from("raffles")
      .select("status")
      .eq("id", payment.raffle_id)
      .maybeSingle();

    // Los números se dan de baja solo si el sorteo sigue vendiendo. Después del
    // cierre el listado ya está comprometido por los hashes: se deja como está
    // y el caso queda para revisión manual.
    if (raffle?.status === "active") {
      const { data: voided, error: voidError } = await admin.rpc(
        "void_sold_numbers",
        {
          p_raffle_id: payment.raffle_id,
          p_user_id: payment.user_id,
          p_numbers: payment.numbers,
          p_payment_id: payment.id,
        },
      );

      if (voidError) {
        console.error(
          "Webhook MP: no se pudieron dar de baja los números del contracargo",
          voidError,
        );
      } else {
        console.warn("Webhook MP: devolución/contracargo procesado", {
          externalReference,
          mpPaymentId: paymentId,
          mpStatus,
          numerosLiberados: Number(voided ?? 0),
        });
      }
    } else {
      console.error(
        "Webhook MP: devolución/contracargo con el sorteo ya cerrado — requiere revisión manual",
        {
          externalReference,
          mpPaymentId: paymentId,
          mpStatus,
          estadoSorteo: raffle?.status ?? "desconocido",
        },
      );
    }

    return NextResponse.json({ received: true, reversal: mpStatus });
  }

  // null cuando el pago sigue en curso: en ese caso no se tocan los números.
  const failureStatus = mapMpFailureStatus(mpStatus);

  if (mpStatus === "approved") {
    // Antes de entregar: ¿Mercado Pago cobró lo que había que cobrar?
    //
    // `transaction_amount` puede venir ausente según cómo responda la API. En
    // ese caso no se puede conciliar y se sigue: bloquear todo aprobado por un
    // campo faltante sería peor que el agujero que se cierra acá.
    const currencyMismatch =
      typeof mpPayment.currency_id === "string" &&
      mpPayment.currency_id !== "ARS";

    const cobrado = mpPayment.transaction_amount;
    const amountMismatch =
      cobrado !== null &&
      cobrado !== undefined &&
      !amountMatches(payment.amount, cobrado);

    if (currencyMismatch || amountMismatch) {
      console.error(
        "Webhook MP: importe o moneda no coinciden con el registro — requiere conciliación manual",
        {
          externalReference,
          mpPaymentId: paymentId,
          esperado: payment.amount,
          cobrado: cobrado ?? null,
          moneda: mpPayment.currency_id ?? null,
        },
      );

      // Se guarda el id para poder buscarlo y decidir: entregar o reembolsar.
      await admin
        .from("payments")
        .update({ mp_payment_id: String(paymentId) })
        .eq("id", payment.id);

      return NextResponse.json(
        { received: true, reconciled: false, reason: "amount_mismatch" },
        { status: 200 },
      );
    }

    // Transición atómica reserved -> sold. Es idempotente: si ya se vendieron,
    // el UPDATE no afecta filas (devuelve 0) y no hay doble venta.
    const { data: soldRows, error: sellError } = await admin.rpc(
      "sell_numbers",
      {
        p_raffle_id: payment.raffle_id,
        p_user_id: payment.user_id,
        p_numbers: payment.numbers,
        p_payment_id: payment.id,
      },
    );

    if (sellError) {
      console.error("Webhook MP: error al vender números", sellError);
      return NextResponse.json(
        { error: "Error interno procesando la solicitud" },
        { status: 500 },
      );
    }

    // El cobro puede confirmarse DESPUÉS de que el cron libere la reserva (10
    // minutos) o de que el número se venda a otra persona. Si se ignora el
    // conteo, el pago queda "approved" sin un solo número entregado y nadie se
    // entera: plata cobrada, premio inexistente.
    const expected = Array.isArray(payment.numbers) ? payment.numbers.length : 0;
    const delivered = Number(soldRows ?? 0);

    if (delivered !== expected) {
      console.error(
        "Webhook MP: pago aprobado sin números entregados — requiere conciliación manual",
        {
          externalReference,
          mpPaymentId: paymentId,
          esperados: expected,
          entregados: delivered,
        },
      );

      // Se guarda el id de Mercado Pago para poder buscarlo y reembolsar. El
      // estado queda en `pending` a propósito: significa «cobrado, sin
      // entregar» y tiene que verlo una persona.
      await admin
        .from("payments")
        .update({ mp_payment_id: String(paymentId) })
        .eq("id", payment.id);

      return NextResponse.json(
        {
          received: true,
          reconciled: false,
          reason: "payment_without_numbers",
        },
        { status: 200 },
      );
    }

    await admin
      .from("payments")
      .update({ status: "approved", mp_payment_id: String(paymentId) })
      .eq("id", payment.id);

    // Aviso informativo al organizador (tabla notifications, 0089/0090).
    // Es best-effort: un fallo acá no puede tumbar un pago ya acreditado.
    const { error: avisoError } = await admin.rpc("notificar_pago_aprobado", {
      p_payment_id: payment.id,
    });
    if (avisoError) {
      console.error(
        "Webhook MP: no se pudo crear el aviso de pago acreditado",
        avisoError,
      );
    }

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
