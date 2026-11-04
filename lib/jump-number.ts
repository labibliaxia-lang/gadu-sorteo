/**
 * Búsqueda de un número puntual en la grilla pública.
 *
 * El comprador escribe el número como lo ve en el talón (por ejemplo "0150" o
 * "150") y la grilla tiene que ubicarlo en la página correcta, resaltarlo y,
 * cuando confirma, dejarlo seleccionado. La lógica vive acá para poder probarla
 * sin navegador.
 */

/** Deja sólo dígitos y limita la longitud a la cantidad de cifras del sorteo. */
export function normalizeJumpInput(raw: string, digits: number): string {
  const onlyDigits = raw.replace(/\D/g, "");
  return digits > 0 ? onlyDigits.slice(0, digits) : onlyDigits;
}

/**
 * Devuelve el número buscado o `null` si el texto no corresponde a un número
 * válido del sorteo. Acepta ceros a la izquierda ("0150" → 150).
 */
export function parseJumpNumber(
  raw: string,
  totalCount: number,
): number | null {
  const onlyDigits = raw.replace(/\D/g, "");
  if (onlyDigits === "" || totalCount < 1) return null;

  const value = Number(onlyDigits);
  if (!Number.isInteger(value) || value < 1 || value > totalCount) return null;

  return value;
}

export interface JumpLocation {
  /** Página (base 0) donde vive el número. */
  page: number;
  /** Fila dentro de la página (base 0). */
  row: number;
}

/** Ubica el número en la paginación actual de la grilla. */
export function locateNumber(
  target: number,
  totalCount: number,
  pageSize: number,
  cols: number,
): JumpLocation | null {
  if (
    !Number.isInteger(target) ||
    target < 1 ||
    target > totalCount ||
    pageSize < 1 ||
    cols < 1
  ) {
    return null;
  }

  const index = target - 1;
  return {
    page: Math.floor(index / pageSize),
    row: Math.floor((index % pageSize) / cols),
  };
}
