/**
 * Lógica de dinero compartida por las rutas de checkout y el webhook.
 *
 * Vive fuera de las rutas a propósito: aquí se puede probar sin Supabase ni
 * Next, y las dos rutas que cobran dejan de duplicar la misma cuenta.
 */

/** Estados de `payments.status` tras los que no hay nada más que hacer. */
const TERMINAL_PAYMENT_STATUSES = new Set([
  "approved",
  "rejected",
  "cancelled",
  "refunded",
  "charged_back",
  "expired",
]);

/** Estados de Mercado Pago que obligan a liberar los números reservados. */
const RELEASING_MP_STATUSES = new Set([
  "rejected",
  "cancelled",
  "refunded",
  "charged_back",
]);

/** Estados de MP que, al liberar, dejan el pago como "rejected" y no "cancelled". */
const REJECTED_MP_STATUSES = new Set(["rejected", "refunded", "charged_back"]);

/** ¿El pago ya está en un estado del que no se vuelve? */
export function isTerminalPaymentStatus(status: string): boolean {
  return TERMINAL_PAYMENT_STATUSES.has(status);
}

/**
 * Importe a cobrar, redondeado a centavos.
 *
 * `pricePerNumber` llega como string desde Postgres (`numeric`); se convierte
 * aquí para que la cuenta sea la misma en todas las rutas.
 */
export function computeAmount(
  count: number,
  pricePerNumber: number | string,
): number {
  const price = Number(pricePerNumber);
  return Math.round(count * price * 100) / 100;
}

/**
 * Estado final del pago cuando Mercado Pago informa un fallo.
 *
 * Devuelve null cuando el estado no libera números (pending, in_process,
 * authorized, in_mediation): en esos casos las reservas siguen vivas.
 */
export function mapMpFailureStatus(
  mpStatus: string,
): "rejected" | "cancelled" | null {
  if (!RELEASING_MP_STATUSES.has(mpStatus)) return null;
  return REJECTED_MP_STATUSES.has(mpStatus) ? "rejected" : "cancelled";
}
