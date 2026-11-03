import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Timestamp en milisegundos en que se reinicia la ventana. */
  reset: number;
}

const FAIL_OPEN: RateLimitResult = {
  success: true,
  limit: 0,
  remaining: 0,
  reset: 0,
};

let warnedMissingConfig = false;
let checkoutLimiter: Ratelimit | null | undefined;
let mockLimiter: Ratelimit | null | undefined;
let webhookLimiter: Ratelimit | null | undefined;

function createLimiter(
  prefix: string,
  limit: number,
  window: `${number} ${"s" | "m" | "h"}`,
): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn(
        "[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN no configuradas: rate limiting en fail-open.",
      );
    }
    return null;
  }

  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: false,
    prefix: `gadu:${prefix}`,
  });
}

function getCheckoutLimiter(): Ratelimit | null {
  if (checkoutLimiter === undefined) {
    checkoutLimiter = createLimiter("checkout", 5, "1 m");
  }
  return checkoutLimiter;
}

function getMockLimiter(): Ratelimit | null {
  if (mockLimiter === undefined) {
    mockLimiter = createLimiter("mock-payment", 5, "1 m");
  }
  return mockLimiter;
}

function getWebhookLimiter(): Ratelimit | null {
  if (webhookLimiter === undefined) {
    webhookLimiter = createLimiter("webhook", 60, "1 m");
  }
  return webhookLimiter;
}

async function limit(
  limiter: Ratelimit | null,
  identifier: string,
): Promise<RateLimitResult> {
  if (!limiter) return FAIL_OPEN;

  try {
    return await limiter.limit(identifier);
  } catch (error) {
    // Fail-open ante una caída de Upstash: no bloqueamos pagos ni webhooks
    // legítimos por un problema del limitador. Se registra para alertar.
    console.error("[ratelimit] error consultando Upstash; fail-open", error);
    return FAIL_OPEN;
  }
}

/** 5 requests por minuto por usuario autenticado. */
export function limitCheckout(userId: string): Promise<RateLimitResult> {
  return limit(getCheckoutLimiter(), userId);
}

/** 5 requests por minuto por usuario autenticado. */
export function limitMockPayment(userId: string): Promise<RateLimitResult> {
  return limit(getMockLimiter(), userId);
}

/** 60 requests por minuto por IP (Mercado Pago). */
export function limitWebhook(ip: string): Promise<RateLimitResult> {
  return limit(getWebhookLimiter(), ip);
}

/** IP del cliente según los headers de Vercel; "unknown" como último recurso. */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}

/** Header estándar para que el cliente sepa cuándo reintentar. */
export function retryAfterSeconds(result: RateLimitResult): number {
  if (!result.reset) return 60;
  return Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
}
