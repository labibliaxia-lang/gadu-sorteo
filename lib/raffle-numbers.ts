/**
 * Lectura completa de los números vendidos de un sorteo.
 *
 * PostgREST corta cada respuesta en `max_rows` (1000 por defecto en Supabase),
 * así que un `select` sin paginar devuelve una lista incompleta. En el
 * verificador eso es peor que un error: recalcula el hash con menos números que
 * los sorteados y le dice al comprador que hubo fraude.
 *
 * Hallazgo de la auditoría 2026-11-04: la página pública no paginaba (tope real
 * de 1000) y `/verificar` cortaba en 5000, contra un máximo de 10.000 números
 * del plan premium (0024).
 */

/** Filas por pedido: el `max_rows` por defecto de PostgREST. */
export const SOLD_NUMBERS_PAGE_SIZE = 1000;

/** Tope del plan premium (0024). Por encima no hay sorteo válido. */
export const SOLD_NUMBERS_MAX = 10_000;

export interface SoldNumbersPage {
  data: { number: number }[] | null;
  error: unknown;
}

/**
 * Pide páginas de `pageSize` filas hasta agotar el listado o llegar al tope.
 *
 * El orden lo fija el llamador (`order("number")`): sin un orden estable la
 * paginación puede repetir o saltear filas.
 */
export async function collectSoldNumbers(
  fetchPage: (from: number, to: number) => Promise<SoldNumbersPage>,
  options: { pageSize?: number; max?: number } = {},
): Promise<number[]> {
  const pageSize = options.pageSize ?? SOLD_NUMBERS_PAGE_SIZE;
  const max = options.max ?? SOLD_NUMBERS_MAX;
  const numbers: number[] = [];

  for (let from = 0; numbers.length < max; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);

    // Un error de red o de permisos corta acá: devolver una lista parcial como
    // si fuera completa es lo que produce el falso positivo de fraude.
    if (error || !data || data.length === 0) break;

    numbers.push(...data.map((row) => row.number));

    // Página incompleta = última.
    if (data.length < pageSize) break;
  }

  return numbers.slice(0, max);
}
