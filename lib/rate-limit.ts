import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Límite de acciones por usuario/ventana, apoyado en Postgres (0040) porque
 * Vercel no comparte memoria entre invocaciones.
 *
 * Si la migración todavía no está aplicada o la consulta falla, devuelve
 * `true` (fail-open): un problema de infraestructura no debe bloquear una
 * acción legítima. El caso crítico (reservas) tiene además su propio chequeo
 * dentro del RPC.
 */
export async function allowRateLimitedAction(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      console.error("[rate-limit] no se pudo verificar:", error.message);
      return true;
    }

    return data !== false;
  } catch (error) {
    console.error("[rate-limit] error:", error);
    return true;
  }
}
