import type { SupabaseClient } from "@supabase/supabase-js";

import type { SenalesConfianza } from "@/lib/confianza";

/**
 * Junta las señales que alimentan el semáforo de confianza.
 *
 * Por qué consultas chicas y separadas en vez de una vista SQL: el semáforo
 * tiene que poder cambiar sin migración, y cada señal se lee de una tabla que ya
 * existe. Si mañana se agrega una señal nueva, se suma acá.
 *
 * Todas las lecturas pasan por RLS con la sesión del visitante. `reviews` y
 * `raffles` son públicas; `refunds` y `raffle_reports` no, así que para un
 * visitante anónimo cuentan como cero. Es una limitación real: el semáforo
 * público no puede ver la deuda si la RLS no se la deja ver. Por eso las
 * denuncias y devoluciones se muestran sólo cuando el que mira es el dueño o el
 * superadmin; para el comprador, el peso lo ponen las señales públicas.
 */
export async function cargarSenalesConfianza(
  supabase: SupabaseClient,
  organizadorId: string,
): Promise<SenalesConfianza> {
  const vacio: SenalesConfianza = {
    kycAprobado: false,
    cuentaDesde: null,
    sorteosSorteados: 0,
    sorteosCancelados: 0,
    sorteosActivos: 0,
    devolucionesPendientes: 0,
    denunciasAbiertas: 0,
    resenas: 0,
    promedioResenas: null,
  };

  if (!organizadorId) return vacio;

  const [perfil, sorteos, resenas] = await Promise.all([
    supabase
      .from("public_organizers")
      .select("id, is_verified")
      .eq("id", organizadorId)
      .maybeSingle(),
    supabase.from("raffles").select("id, status").eq("created_by", organizadorId),
    supabase.from("reviews").select("rating").eq("organizer_id", organizadorId),
  ]);

  const cuenta = await supabase
    .from("profiles")
    .select("created_at")
    .eq("id", organizadorId)
    .maybeSingle();

  const filasSorteos = sorteos.data ?? [];
  const sorteosSorteados = filasSorteos.filter((r) => r.status === "drawn").length;
  const sorteosCancelados = filasSorteos.filter((r) => r.status === "cancelled").length;
  const sorteosActivos = filasSorteos.filter((r) => r.status === "active").length;

  const ratings = (resenas.data ?? [])
    .map((r) => Number(r.rating))
    .filter((n) => Number.isFinite(n));
  const promedioResenas =
    ratings.length > 0
      ? Math.round((ratings.reduce((t, n) => t + n, 0) / ratings.length) * 10) / 10
      : null;

  // Deuda y denuncias: la RLS deja verlas al dueño y al superadmin. Para un
  // visitante la consulta vuelve vacía y no penaliza, que es lo correcto:
  // no se puede acusar con datos que no se pueden ver.
  const idsSorteos = filasSorteos.map((r) => r.id);
  let devolucionesPendientes = 0;
  let denunciasAbiertas = 0;

  if (idsSorteos.length > 0) {
    const [refunds, reports] = await Promise.all([
      supabase
        .from("refunds")
        .select("*", { count: "exact", head: true })
        .in("raffle_id", idsSorteos)
        .eq("status", "pending"),
      supabase
        .from("raffle_reports")
        .select("*", { count: "exact", head: true })
        .in("raffle_id", idsSorteos)
        .eq("status", "pending"),
    ]);
    devolucionesPendientes = refunds.count ?? 0;
    denunciasAbiertas = reports.count ?? 0;
  }

  return {
    kycAprobado: Boolean(perfil.data?.is_verified),
    cuentaDesde: cuenta.data?.created_at ?? null,
    sorteosSorteados,
    sorteosCancelados,
    sorteosActivos,
    devolucionesPendientes,
    denunciasAbiertas,
    resenas: ratings.length,
    promedioResenas,
  };
}
