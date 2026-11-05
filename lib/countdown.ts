import type { RaffleStatus } from "@/lib/types";

export type CountdownKind = "running" | "reached" | "inactive";

export interface CountdownState {
  kind: CountdownKind;
  /** Milisegundos que faltan; 0 cuando ya llegó o el sorteo no está a la venta. */
  remainingMs: number;
  /** "2d 04:12:05" cuando corre; vacío en los otros casos. */
  label: string;
}

const SECOND = 1000;
const DAY_SECONDS = 24 * 60 * 60;
const HOUR_SECONDS = 60 * 60;
const MINUTE_SECONDS = 60;

/**
 * Formatea un resto en milisegundos como `2d 04:12:05` (o `04:12:05` si no
 * quedan días). Nunca devuelve números negativos.
 */
export function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / SECOND));
  const days = Math.floor(totalSeconds / DAY_SECONDS);
  const hours = Math.floor((totalSeconds % DAY_SECONDS) / HOUR_SECONDS);
  const minutes = Math.floor((totalSeconds % HOUR_SECONDS) / MINUTE_SECONDS);
  const seconds = totalSeconds % MINUTE_SECONDS;

  const pad = (value: number) => String(value).padStart(2, "0");
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  return days > 0 ? `${days}d ${clock}` : clock;
}

/**
 * Estado de la cuenta regresiva de un sorteo.
 *
 * - `running`: falta para la fecha del sorteo.
 * - `reached`: la fecha pasó y el sorteo sigue pendiente (manual sin ejecutar).
 * - `inactive`: el sorteo ya no está a la venta o la fecha no es válida.
 */
export function countdownState(
  nowMs: number,
  drawDateIso: string,
  status: RaffleStatus,
): CountdownState {
  if (status !== "active") {
    return { kind: "inactive", remainingMs: 0, label: "" };
  }

  const drawMs = new Date(drawDateIso).getTime();
  if (!Number.isFinite(drawMs)) {
    return { kind: "inactive", remainingMs: 0, label: "" };
  }

  const remainingMs = drawMs - nowMs;
  if (remainingMs <= 0) {
    return { kind: "reached", remainingMs: 0, label: "" };
  }

  return { kind: "running", remainingMs, label: formatRemaining(remainingMs) };
}
