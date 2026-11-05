"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { blockerMessages } from "@/lib/account-deletion";

export type DeletionActionResult =
  | { ok: true }
  | { ok: false; error: string; blockers?: string[] };

/**
 * Pide la baja de la propia cuenta.
 *
 * No borra nada: crea la solicitud. Antes consulta `account_deletion_blockers`
 * para dar un motivo legible en vez de dejar que la aprobación falle después.
 */
export async function requestAccountDeletion(
  reason?: string,
): Promise<DeletionActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Iniciá sesión para pedir la baja." };

  const { data: motivos, error: blockersError } = await supabase.rpc(
    "account_deletion_blockers",
    { p_user: user.id },
  );

  if (blockersError) {
    return {
      ok: false,
      error: "No pudimos verificar tu situación. Probá de nuevo en un rato.",
    };
  }

  const bloqueos = blockerMessages((motivos ?? []) as string[]);
  if (bloqueos.length > 0) {
    return {
      ok: false,
      error: "Todavía no podés pedir la baja:",
      blockers: bloqueos,
    };
  }

  const limpio = reason?.trim().slice(0, 500) || null;
  const { error } = await supabase.from("account_deletion_requests").insert({
    user_id: user.id,
    reason: limpio,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ya tenés una solicitud pendiente." };
    }
    return { ok: false, error: "No pudimos registrar la solicitud. Probá de nuevo." };
  }

  revalidatePath("/perfil");
  return { ok: true };
}

/** Cancela la solicitud propia mientras siga pendiente. */
export async function cancelAccountDeletion(): Promise<DeletionActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Iniciá sesión para continuar." };

  const { error } = await supabase
    .from("account_deletion_requests")
    .update({ status: "cancelled" })
    .eq("user_id", user.id)
    .eq("status", "pending");

  if (error) {
    return { ok: false, error: "No pudimos cancelar la solicitud. Probá de nuevo." };
  }

  revalidatePath("/perfil");
  return { ok: true };
}
