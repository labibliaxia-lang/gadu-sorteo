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

/**
 * Devoluciones y contracargos: el dinero vuelve, así que el pago baja de
 * `approved` y los números tienen que dejar de contar.
 */
const REVERSAL_MP_STATUSES = new Set(["refunded", "charged_back"]);

/** ¿El pago ya está en un estado del que no se vuelve? */
export function isTerminalPaymentStatus(status: string): boolean {
  return TERMINAL_PAYMENT_STATUSES.has(status);
}

/** ¿Mercado Pago informa una devolución o un contracargo? */
export function isReversalStatus(mpStatus: string): boolean {
  return REVERSAL_MP_STATUSES.has(mpStatus);
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

/**
 * ¿El importe que informa Mercado Pago coincide con el que registramos?
 *
 * `payments.amount` llega como string desde Postgres (`numeric`) y Mercado Pago
 * devuelve un número: se normalizan los dos. La tolerancia de un centavo evita
 * rechazar un cobro legítimo por redondeo de coma flotante.
 *
 * Hallazgo #9: el webhook nunca comparaba importes, así que un pago aprobado
 * por menos de lo que correspondía entregaba los números igual.
 */
export function amountMatches(
  registrado: number | string,
  cobrado: number | string | null | undefined,
  tolerancia = 0.01,
): boolean {
  const esperado = Number(registrado);
  const recibido = Number(cobrado);

  if (!Number.isFinite(esperado) || !Number.isFinite(recibido)) return false;

  return Math.abs(esperado - recibido) <= tolerancia;
}

/**
 * ¿Los dos conjuntos de números son el mismo?
 *
 * Se compara por conjunto, no por orden: `reserve_numbers` los devuelve
 * ordenados y la base guarda el array como llegó. Sirve para reconocer un
 * checkout repetido del mismo carrito y reutilizar su pago en vez de crear un
 * segundo (hallazgo #2: doble cobro de los mismos números).
 */
export function sameNumberSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;

  const seen = new Set<number>();

  for (const value of a) {
    const number = Number(value);
    if (!Number.isFinite(number)) return false;
    seen.add(number);
  }

  // Los duplicados dentro de un mismo array no cuentan como conjunto válido.
  if (seen.size !== a.length) return false;

  return b.every((value) => seen.has(Number(value)));
}
