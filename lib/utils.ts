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
export function formatPrice(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Formatea una fecha legible en es-AR. */
export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
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
