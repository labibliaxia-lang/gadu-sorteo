import { createClient } from "@/lib/supabase/server";
import {
  resumirVentas,
  type FilaVenta,
  type ResumenVentas,
} from "@/lib/ventas";

/**
 * Carga compartida entre la planilla y su exportación a CSV.
 *
 * La plata sale de `raffle_sales_summary` (migración 0091): cobrado, devuelto y
 * neto por comprador. Antes se calculaba `números × precio` en JavaScript, que
 * informa mal en cuanto cambia el precio o hay una devolución.
 */

export type ResultadoVentas =
  | {
      ok: true;
      sorteo: { id: string; title: string; precio: number };
      filas: FilaVenta[];
      resumen: ResumenVentas;
    }
  | { ok: false; motivo: "sin-sesion" | "sin-permiso" | "no-existe" | "error" };

interface FilaResumen {
  buyer_id: string | null;
  full_name: string | null;
  phone: string | null;
  numbers: number[] | null;
  quantity: number | null;
  paid: number | null;
  refunded: number | null;
  net: number | null;
  payment_state: string | null;
  first_sale_at: string | null;
  last_sale_at: string | null;
}

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

  const { data, error } = await supabase.rpc("raffle_sales_summary", {
    p_raffle_id: sorteoId,
  });

  if (error) return { ok: false, motivo: "error" };

  const filas: FilaVenta[] = ((data ?? []) as FilaResumen[]).map((fila) => ({
    compradorId: fila.buyer_id ?? null,
    nombre: fila.full_name ?? "Sin comprador registrado",
    telefono: fila.phone ?? null,
    numeros: (fila.numbers ?? []) as number[],
    cantidad: Number(fila.quantity ?? 0),
    total: Number(fila.net ?? 0),
    cobrado: Number(fila.paid ?? 0),
    devuelto: Number(fila.refunded ?? 0),
    neto: Number(fila.net ?? 0),
    estadoPago: (fila.payment_state ?? "manual") as FilaVenta["estadoPago"],
    primeraVenta: fila.first_sale_at ?? null,
    ultimaVenta: fila.last_sale_at ?? null,
  }));

  return {
    ok: true,
    sorteo: { id: raffle.id, title: raffle.title, precio: Number(raffle.price_per_number ?? 0) },
    filas,
    resumen: resumirVentas(filas),
  };
}
