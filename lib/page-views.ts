/**
 * Contrato del tracking de tráfico (`page_views`).
 *
 * Módulo PURO a propósito: lo importan el route handler `/api/track-visit`, el
 * componente cliente `PageViewTracker` y los tests de vitest en node. Nada de
 * `next/headers`, `next/navigation` ni Supabase acá.
 */

export const TRACK_VISIT_ENDPOINT = "/api/track-visit";

/** Zona del producto. El servidor puede estar en cualquier otra. */
const ARGENTINA_TZ = "America/Argentina/Buenos_Aires";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Tope defensivo: una serie de más de un año no tiene uso en el panel. */
const MAX_SERIES_DAYS = 366;

export interface TrafficPoint {
  day: string;
  views: number;
  visitors: number;
}

/**
 * Normaliza la ruta de una vista a la única forma que se registra.
 *
 * Acepta la home (`/`) y la página de un sorteo (`/sorteos/<uuid>`); cualquier
 * otra entrada devuelve `null`. Se quitan query y hash, se ignora la barra
 * final y el uuid se devuelve en minúsculas.
 */
export function normalizeTrackedPath(input: unknown): string | null {
  if (typeof input !== "string") return null;

  // Query y hash: se corta en el primero que aparezca.
  const cut = input.search(/[?#]/);
  const pathname = (cut >= 0 ? input.slice(0, cut) : input).trim();

  // Sólo pathnames absolutos: nada de URLs completas ni rutas relativas.
  if (!pathname.startsWith("/")) return null;

  const segments = pathname.split("/").filter(Boolean);

  // Home: `/`, también con barras de más o query (`/?utm=x`).
  if (segments.length === 0) return "/";

  if (
    segments.length === 2 &&
    segments[0] === "sorteos" &&
    UUID_PATTERN.test(segments[1])
  ) {
    return `/sorteos/${segments[1].toLowerCase()}`;
  }

  return null;
}

const ARGENTINA_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: ARGENTINA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Clave `YYYY-MM-DD` del instante `date` en la zona de Argentina.
 *
 * Se usa Intl con `timeZone` explícita: la zona del servidor (UTC en Vercel)
 * daría otro día cerca de la medianoche argentina.
 */
function argentinaDayKey(date: Date): string {
  const parts = ARGENTINA_DAY.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

/** Corre una clave `YYYY-MM-DD` `offsetDays` días (aritmética en UTC). */
function shiftDayKey(day: string, offsetDays: number): string {
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  // Mediodía UTC: sumar o restar días nunca cruza de fecha por el offset.
  const shifted = new Date(
    Date.UTC(year, month - 1, dayOfMonth, 12) + offsetDays * DAY_MS,
  );
  return shifted.toISOString().slice(0, 10);
}

/** Conteo no negativo; `bigint` de Postgres puede llegar como string. */
function toCount(value: number | string | undefined): number {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
}

/**
 * Últimos `days` días (inclusive hoy, en zona Argentina), ascendentes y con 0
 * en los días sin datos. Las filas cuyo `day` no es `YYYY-MM-DD` o cae fuera de
 * la ventana se ignoran; si hay más de una fila por día, se suman.
 */
export function buildDailySeries(
  rows: readonly {
    day: string;
    views: number | string;
    visitors?: number | string;
  }[],
  days: number,
  now: Date = new Date(),
): TrafficPoint[] {
  if (!Number.isFinite(days) || days < 1) return [];

  const total = Math.min(Math.floor(days), MAX_SERIES_DAYS);
  const reference = Number.isNaN(now.getTime()) ? new Date() : now;
  const today = argentinaDayKey(reference);

  const series: TrafficPoint[] = [];
  const byDay = new Map<string, TrafficPoint>();

  for (let offset = total - 1; offset >= 0; offset -= 1) {
    const day = shiftDayKey(today, -offset);
    const point: TrafficPoint = { day, views: 0, visitors: 0 };
    series.push(point);
    byDay.set(day, point);
  }

  for (const row of rows) {
    const point = byDay.get(row.day);
    if (!point) continue;
    point.views += toCount(row.views);
    point.visitors += toCount(row.visitors);
  }

  return series;
}
