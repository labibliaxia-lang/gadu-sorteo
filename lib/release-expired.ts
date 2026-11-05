import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Libera reservas vencidas de CUALQUIER comprador, como red de seguridad.
 *
 * POR QUÉ EXISTE
 * La liberación global vive en `release_expired_reservations` y la dispara el
 * cron. En Vercel Hobby el cron sólo puede correr **una vez por día**, así que
 * una reserva vencida puede quedar tomada hasta 24 h: el número no está vendido
 * pero tampoco disponible para nadie más.
 *
 * El código ya usa este patrón para los sorteos automáticos
 * (`maybeAutoDrawRaffle` en `lib/auto-draw.ts`, llamado desde la página pública).
 * Esto es lo mismo para las reservas.
 *
 * GATE DE FRECUENCIA
 * La página pública se renderiza mucho: sin freno, cada visita sería un UPDATE.
 * Se corre como mucho una vez por minuto POR INSTANCIA. No es un candado
 * distribuido; es suficiente para que el costo sea despreciable y para que el
 * número se libere en minutos, no en un día. Si algún día hay varias instancias
 * o mucho tráfico, esto se reemplaza por el cron pago o un scheduler externo.
 */

const INTERVALO_MS = 60_000;

let ultimaEjecucion = 0;

/**
 * @param ahora inyectable para tests
 * @param forzar ignora el gate de frecuencia (tests y mantenimiento a mano)
 * @returns cuántas reservas liberó, o null si no corrió / falló
 */
export async function maybeReleaseExpiredReservations(opciones?: {
  ahora?: number;
  forzar?: boolean;
}): Promise<number | null> {
  const ahora = opciones?.ahora ?? Date.now();

  if (!opciones?.forzar && ahora - ultimaEjecucion < INTERVALO_MS) {
    return null;
  }
  ultimaEjecucion = ahora;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("release_expired_reservations");

    if (error) {
      console.error("[reservas] no se pudieron liberar las vencidas:", error.message);
      return null;
    }

    const liberadas = typeof data === "number" ? data : 0;
    if (liberadas > 0) {
      console.info(`[reservas] liberadas ${liberadas} reservas vencidas`);
    }
    return liberadas;
  } catch (error) {
    console.error("[reservas] error liberando vencidas:", error);
    return null;
  }
}

/** Sólo para tests: reinicia el gate de frecuencia. */
export function reiniciarGateDeLiberacion(): void {
  ultimaEjecucion = 0;
}
