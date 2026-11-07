"use server";

import { revalidatePath } from "next/cache";

import { requireSuperadminSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PlanConfigInput {
  plan_name: string;
  max_raffles: number;
  max_numbers: number;
  max_prizes: number;
  price_ars: number;
  allow_referrals: boolean;
  allow_landing: boolean;
  allow_mp: boolean;
  allow_auto_draw: boolean;
  max_referrals_per_raffle: number;
}

const PLANES = ["organizador", "pro", "premium", "social"];

function entero(valor: unknown, min: number, max: number): number | null {
  const n = Number(valor);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    return null;
  }
  return n;
}

/** Solo superadmin. Actualiza límites y toggles de los 4 planes. */
export async function guardarPlanes(
  configs: PlanConfigInput[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireSuperadminSession();
  if (!ctx) return { ok: false, error: "No autorizado" };

  if (!Array.isArray(configs) || configs.length === 0) {
    return { ok: false, error: "No hay planes para guardar." };
  }

  const filas: Record<string, string | number | boolean>[] = [];

  for (const c of configs) {
    if (!PLANES.includes(c.plan_name)) {
      return { ok: false, error: `Plan inválido: ${c.plan_name}` };
    }

    const raffles = entero(c.max_raffles, 0, 1000);
    const numbers = entero(c.max_numbers, 10, 10000);
    const prizes = entero(c.max_prizes, 1, 30);
    const referidos = entero(c.max_referrals_per_raffle, 0, 1000);
    const precio = Number(c.price_ars);

    if (raffles === null || numbers === null || prizes === null || referidos === null) {
      return { ok: false, error: `Límites inválidos en ${c.plan_name}.` };
    }
    if (!Number.isFinite(precio) || precio < 0) {
      return { ok: false, error: `Precio inválido en ${c.plan_name}.` };
    }

    filas.push({
      plan_name: c.plan_name,
      max_raffles: raffles,
      max_numbers: numbers,
      max_prizes: prizes,
      price_ars: Math.round(precio * 100) / 100,
      allow_referrals: Boolean(c.allow_referrals),
      allow_landing: Boolean(c.allow_landing),
      allow_mp: Boolean(c.allow_mp),
      allow_auto_draw: Boolean(c.allow_auto_draw),
      max_referrals_per_raffle: referidos,
      updated_at: new Date().toISOString(),
    });
  }

  const admin = createAdminClient();
  for (const fila of filas) {
    const { error } = await admin
      .from("plan_configs")
      .update(fila)
      .eq("plan_name", fila.plan_name as string);

    if (error) {
      return { ok: false, error: `No se pudo guardar: ${error.message}` };
    }
  }

  revalidatePath("/admin/super/planes");
  revalidatePath("/planes");
  return { ok: true };
}
