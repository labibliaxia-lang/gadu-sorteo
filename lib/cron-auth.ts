import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Autorización del cron. Pureza a propósito: se puede testear sin servidor.
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * La versión anterior hacía `!!cronSecret && authHeader === \`Bearer ${cronSecret}\``
 * y devolvía **401** en los dos casos: credencial inválida y variable sin
 * configurar. El efecto fue que, sin `CRON_SECRET`, las reservas vencidas nunca
 * se liberaron y el log no lo delataba: parecía un intento de acceso no
 * autorizado, no una configuración faltante.
 *
 * Configuración faltante y credencial inválida son problemas distintos y tienen
 * que verse distintos:
 *   - falta la variable  → 500 (roto del lado del servidor, hay que arreglarlo)
 *   - el header no cierra → 401 (alguien golpeando la puerta)
 *
 * HALLAZGO #18 DE LA AUDITORÍA: la comparación era `===`, que corta en el
 * primer byte distinto y filtra por tiempo cuántos bytes acertó el atacante.
 * Ahora se comparan los SHA-256 en tiempo constante: el hash iguala las
 * longitudes, así que tampoco se filtra el largo del secreto.
 */

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 500; error: string; detalle: string };

/** Igualdad en tiempo constante, sin filtrar longitud. */
function igualdadConstante(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a, "utf8").digest();
  const hashB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * @param secretoConfigurado `process.env.CRON_SECRET` tal cual
 * @param headerAuthorization header `authorization` del request, o ""
 */
export function evaluarCronAuth(
  secretoConfigurado: string | undefined,
  headerAuthorization: string,
): CronAuthResult {
  if (!secretoConfigurado || secretoConfigurado.trim() === "") {
    return {
      ok: false,
      status: 500,
      error: "Cron mal configurado",
      detalle:
        "Falta CRON_SECRET en el entorno. Mientras falte, este cron no libera reservas vencidas ni ejecuta sorteos automáticos.",
    };
  }

  if (!igualdadConstante(headerAuthorization, `Bearer ${secretoConfigurado}`)) {
    return { ok: false, status: 401, error: "No autorizado", detalle: "Credencial inválida." };
  }

  return { ok: true };
}
