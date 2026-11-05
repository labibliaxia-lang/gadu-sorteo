import {
  InvalidWebhookSignatureError,
  MercadoPagoConfig,
  Payment,
  Preference,
  WebhookSignatureValidator,
} from "mercadopago";

export interface PreferenceItem {
  id: string;
  title: string;
  description?: string;
  picture_url?: string;
  quantity: number;
  unit_price: number;
  currency_id: "ARS";
}

export interface CreatePreferenceInput {
  items: PreferenceItem[];
  externalReference: string;
  payerEmail: string;
  backUrls: {
    success: string;
    failure: string;
    pending: string;
  };
  notificationUrl: string;
}

function mpClient() {
  return new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN!,
  });
}

/**
 * Crea una preferencia de Checkout Pro.
 * `externalReference` = id de nuestro registro `payments` para reconciliar
 * el webhook de forma idempotente.
 */
export interface PreferenceResult {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
}

export interface MercadoPagoPaymentResult {
  status?: string;
  status_detail?: string;
  external_reference?: string | null;
  /** Importe cobrado, para conciliar contra `payments.amount` (hallazgo #9). */
  transaction_amount?: number | string | null;
  /** Moneda del cobro: tiene que ser ARS. */
  currency_id?: string | null;
}

export async function createPreference(
  input: CreatePreferenceInput,
): Promise<PreferenceResult> {
  const preference = new Preference(mpClient());

  const body = {
    items: input.items,
    external_reference: input.externalReference,
    back_urls: input.backUrls,
    auto_return: "approved",
    notification_url: input.notificationUrl,
    payer: { email: input.payerEmail },
  };

  // El SDK tipa el body con un tipo interno; el cast es inocuo aquí.
  const result = await preference.create({ body: body as never });
  return result as unknown as PreferenceResult;
}

/** Obtiene un pago de la API de Mercado Pago por su id. */
export async function getMercadoPagoPayment(
  paymentId: number,
): Promise<MercadoPagoPaymentResult> {
  const payment = new Payment(mpClient());
  const result = await payment.get({ id: paymentId });
  return result as unknown as MercadoPagoPaymentResult;
}

/** Datos de la notificación que Mercado Pago firma, tal como llegan. */
export interface WebhookSignatureInput {
  /** Header `x-signature` (`ts=...,v1=...`). */
  xSignature: string | null;
  /** Header `x-request-id`. */
  xRequestId: string | null;
  /** Query param `data.id` de la URL de notificación. */
  dataId: string | null;
}

export type WebhookVerification =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Verifica la firma HMAC del webhook de Mercado Pago con el validador oficial
 * del SDK (`WebhookSignatureValidator`, `mercadopago >= 2.13.0`).
 *
 * El manifest que MP firma es:
 *   `id:[data.id];request-id:[x-request-id];ts:[ts_header];`
 * — `data.id` llega en el query string (en minúsculas si es alfanumérico),
 * `x-request-id` en su header y `ts` en el header `x-signature`. Los valores
 * ausentes se omiten. No es el cuerpo de la petición: firmar `${ts}.${body}`
 * rechazaba las notificaciones reales.
 *
 * Sin ventana de tolerancia a propósito: MP reintenta la misma notificación
 * cada 15 minutos y la idempotencia de `payments` ya impide el doble cobro.
 */
export function verifyWebhookSignature(
  input: WebhookSignatureInput,
): WebhookVerification {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("MP_WEBHOOK_SECRET no está configurado");
    return { ok: false, reason: "MissingSecret" };
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature: input.xSignature,
      xRequestId: input.xRequestId,
      dataId: input.dataId,
      secret,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      return { ok: false, reason: error.reason };
    }
    throw error;
  }
}
