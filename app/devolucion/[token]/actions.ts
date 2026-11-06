"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ConfirmarDevolucionResult =
  | { ok: true }
  | { ok: false; error: string };

/** Confirma la devolución usando el token del enlace compartido. */
export async function confirmarDevolucion(
  token: string,
): Promise<ConfirmarDevolucionResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc("confirm_refund_by_token", {
    p_token: token,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/devolucion/${token}`);
  return { ok: true };
}
