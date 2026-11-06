"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ConfirmRefundResult = { ok: true } | { ok: false; error: string };

/**
 * El comprador avisa que recibió la devolución. No cierra la deuda: eso lo hace
 * el organizador al marcarla pagada. Solo deja la constancia y avisa.
 */
export async function confirmRefundReceived(
  refundId: string,
): Promise<ConfirmRefundResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Iniciá sesión para confirmar." };

  const { error } = await supabase.rpc("confirm_refund_received", {
    p_refund_id: refundId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/mis-numeros");
  return { ok: true };
}
