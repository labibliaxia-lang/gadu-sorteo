/**
 * 0115: las rutas públicas del sorteo aceptan el slug amigable o el UUID viejo.
 *
 * La página principal (`app/sorteos/[slug]/page.tsx`) ya resuelve así. Las
 * sub-rutas (`/verificar`, `/en-vivo`) tienen que usar la misma regla o sus
 * links públicos mueren en 404: el slug no es un id.
 *
 * Compatibilidad: un UUID sigue entrando por la columna `id`, así que ningún
 * enlace viejo se rompe.
 */

export const UUID_SORTEO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Devuelve por qué columna buscar: el UUID entra por `id`, el resto por `slug`. */
export function resolverColumna(valor: string): "id" | "slug" {
  return UUID_SORTEO.test(valor.trim()) ? "id" : "slug";
}
