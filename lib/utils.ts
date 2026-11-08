import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formatea un número con 4 dígitos: 1 -> "0001", 10000 -> "10000". */
export function formatNumber(n: number): string {
  return String(n).padStart(4, "0");
}

/** Formatea un precio en pesos argentinos. */
/**
 * Los locales de next-intl son cortos (`es`, `en`, `pt`); para formatear
 * moneda necesitamos la variante regional. `es-AR` conserva el formato
 * histórico del producto.
 */
const INTL_LOCALES: Record<string, string> = {
  es: "es-AR",
  en: "en-US",
  pt: "pt-BR",
};

function intlLocale(locale: string): string {
  return INTL_LOCALES[locale] ?? locale;
}

/** Precio en la moneda del sorteo (LATAM). */
export function formatPriceIn(
  value: number,
  currency: string = "ARS",
  locale: string = "es-AR",
): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: currency || "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPrice(
  value: number,
  locale: string = "es-AR",
): string {
  return formatPriceIn(value, "ARS", locale);
}

/**
 * Zona del producto. Tiene que estar fija: si se formatea con la zona de quien
 * ejecuta, el servidor (UTC en Vercel) y el navegador (Argentina) producen
 * textos distintos y React lo marca como desajuste de hidratación (#425).
 */
const AR_TZ = "America/Argentina/Buenos_Aires";

/** Formatea una fecha legible en es-AR, siempre en hora argentina. */
export function formatDateTime(
  value: string | Date,
  locale: string = "es-AR",
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: AR_TZ,
  }).format(new Date(value));
}

/**
 * Traduce errores comunes de Supabase Auth a mensajes claros para el usuario.
 * Nos basamos en los códigos/mensajes que devuelve Supabase; no consultamos si
 * un email existe por separado para evitar la enumeración de cuentas.
 */
export function authErrorMessage(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("email rate limit exceeded") || m.includes("over_email_send_rate_limit")) {
    return "Se ha superado el límite de envíos de correo. Esperá unos minutos o configurá un SMTP personalizado.";
  }
  if (m.includes("email not confirmed") || m.includes("email_not_confirmed")) {
    return "Tu correo aún no está confirmado. Revisá tu bandeja de entrada (y el spam).";
  }
  if (m.includes("invalid login credentials")) {
    return "Credenciales inválidas o usuario no confirmado. Revisá tu correo y contraseña.";
  }
  if (m.includes("user already registered") || m.includes("already registered")) {
    return "Ya existe una cuenta con ese email. Probá iniciar sesión.";
  }
  return message;
}
