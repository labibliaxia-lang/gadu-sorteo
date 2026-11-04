/**
 * Regla del sorteo destacado: **uno solo a la vez** (decisión 2026-11-04).
 *
 * El hero de la home tiene un solo lugar; con varios marcados el badge se
 * diluye y el orden dependía de la fecha de creación en vez de la de destacado.
 * Estas funciones son puras para poder probarlas sin base ni navegador.
 */

export interface FeaturedCandidate {
  is_featured?: boolean | null;
  status: string;
  featured_at?: string | null;
}

/** Solo un sorteo activo puede ir al hero. */
export function canFeature(status: string): boolean {
  return status === "active";
}

/**
 * Elige el sorteo del hero: el activo marcado con `featured_at` más reciente.
 * Si no hay ninguno marcado, cae al primer activo para no dejar el hero vacío.
 */
export function pickFeatured<T extends FeaturedCandidate>(
  raffles: T[],
): T | null {
  const marked = raffles
    .filter((raffle) => raffle.is_featured && canFeature(raffle.status))
    .sort(
      (a, b) =>
        (b.featured_at ?? "").localeCompare(a.featured_at ?? ""),
    );

  return (
    marked[0] ??
    raffles.find((raffle) => canFeature(raffle.status)) ??
    raffles[0] ??
    null
  );
}

/**
 * Pone los destacados activos primero, conservando el orden del resto.
 * `Array.prototype.sort` es estable en los motores actuales, así que el orden
 * original de cada grupo no cambia.
 */
export function sortFeaturedFirst<T extends FeaturedCandidate>(
  raffles: T[],
): T[] {
  return [...raffles].sort((a, b) => {
    const aFeatured = Boolean(a.is_featured && canFeature(a.status));
    const bFeatured = Boolean(b.is_featured && canFeature(b.status));
    if (aFeatured === bFeatured) return 0;
    return aFeatured ? -1 : 1;
  });
}
