"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth";
import {
  isAllowedLandingImage,
  landingContentSchema,
} from "@/lib/landing";
import { createClient } from "@/lib/supabase/server";

export type SaveLandingResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

const uuidSchema = z.string().uuid("Identificador inválido");

/**
 * Guarda los bloques de la landing promocional.
 *
 * - Zod valida estructura y longitudes (nunca HTML).
 * - Las imágenes deben venir del bucket público de portadas.
 * - El RPC `owns_raffle` confirma que quien escribe es el dueño o superadmin,
 *   además de `requireAdminSession`; la RLS de raffles vuelve a aplicar.
 */
export async function saveLandingContent(
  raffleId: string,
  blocks: unknown,
): Promise<SaveLandingResult> {
  const ctx = await requireAdminSession();
  if (!ctx) return { ok: false, error: "No autorizado" };

  const id = uuidSchema.safeParse(raffleId);
  if (!id.success) return { ok: false, error: "Sorteo inválido" };

  const parsed = landingContentSchema.safeParse(blocks);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "El contenido de la landing no es válido.",
    };
  }

  for (const block of parsed.data) {
    if (block.type === "image" && !isAllowedLandingImage(block.url)) {
      return {
        ok: false,
        error:
          "La imagen tiene que subirse desde este editor (bucket de Gadu).",
      };
    }
  }

  const supabase = createClient();

  const { data: owns } = await supabase.rpc("owns_raffle", {
    p_raffle_id: id.data,
  });

  if (owns !== true) return { ok: false, error: "No autorizado" };

  const { error } = await supabase
    .from("raffles")
    .update({ landing_content: parsed.data })
    .eq("id", id.data);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/sorteos/${id.data}/landing`);
  revalidatePath(`/admin/sorteos/${id.data}`);
  revalidatePath(`/sorteos/${id.data}`);

  return { ok: true, count: parsed.data.length };
}
