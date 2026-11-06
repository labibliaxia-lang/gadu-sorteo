import { createClient } from "@/lib/supabase/server";
import {
  agruparVentas,
  resumirVentas,
  type Comprador,
  type FilaVenta,
  type NumeroVendido,
  type ResumenVentas,
} from "@/lib/ventas";

/**
 * Carga compartida entre la planilla y su exportación a CSV.
 *
 * Vive acá para que el control de permisos sea uno solo: si mañana cambia quién
 * puede ver las ventas, se cambia en un lugar y no en dos.
 */

export type ResultadoVentas =
  | {
      ok: true;
      sorteo: { id: string; title: string; precio: number };
      filas: FilaVenta[];
      resumen: ResumenVentas;
    }
  | { ok: false; motivo: "sin-sesion" | "sin-permiso" | "no-existe" };

/** PostgREST corta en 1000 filas: hay que paginar o se pierden ventas. */
const PAGINA = 1000;

export async function cargarVentas(sorteoId: string): Promise<ResultadoVentas> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, motivo: "sin-sesion" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin" && profile?.role !== "superadmin") {
    return { ok: false, motivo: "sin-permiso" };
  }

  const { data: raffle } = await supabase
    .from("raffles")
    .select("id, title, price_per_number, created_by")
    .eq("id", sorteoId)
    .single();

  if (!raffle) return { ok: false, motivo: "no-existe" };

  // Cada organizador ve sólo sus sorteos; el superadmin, todos.
  if (profile.role !== "superadmin" && raffle.created_by !== user.id) {
    return { ok: false, motivo: "sin-permiso" };
  }

  const vendidos: NumeroVendido[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from("raffle_numbers")
      .select("number, sold_to, sold_at")
      .eq("raffle_id", sorteoId)
      .eq("status", "sold")
      .order("number")
      .range(desde, desde + PAGINA - 1);

    if (error || !data || data.length === 0) break;
    vendidos.push(...data);
    if (data.length < PAGINA) break;
  }

  const compradores: Comprador[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from("raffle_buyers")
      .select("buyer_id, full_name, phone")
      .eq("raffle_id", sorteoId)
      .order("buyer_id")
      .range(desde, desde + PAGINA - 1);

    if (error || !data || data.length === 0) break;
    compradores.push(...data);
    if (data.length < PAGINA) break;
  }

  const precio = Number(raffle.price_per_number ?? 0);
  const filas = agruparVentas(vendidos, compradores, precio);

  return {
    ok: true,
    sorteo: { id: raffle.id, title: raffle.title, precio },
    filas,
    resumen: resumirVentas(filas),
  };
}
