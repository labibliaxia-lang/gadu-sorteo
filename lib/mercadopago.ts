import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import crypto from "node:crypto";

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
  external_reference?: string | null;
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

/**
 * Verifica la firma HMAC del webhook de Mercado Pago.
 *
 * MP envía el header `x-signature` con el formato:
 *   `ts=<timestamp>,v1=<hmac_sha256_hex>`
 * donde la firma se calcula sobre la cadena `${ts}.${rawBody}` usando
 * `MP_WEBHOOK_SECRET` como clave.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("MP_WEBHOOK_SECRET no está configurado");
    return false;
  }

  const parts = signature.split(",").map((p) => p.trim());
  const tsPart = parts.find((p) => p.startsWith("ts="));
  const v1Part = parts.find((p) => p.startsWith("v1="));

  if (!tsPart || !v1Part) return false;

  const ts = tsPart.slice(3);
  const v1 = v1Part.slice(3);

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${ts}.${rawBody}`)
    .digest("hex");

  // Comparación en tiempo constante para evitar timing attacks.
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
