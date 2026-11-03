"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/terms";

export type EmailPreferenceResult =
  | { ok: true; optIn: boolean }
  | { ok: false; error: string };

/**
 * Guarda la preferencia de avisos por email del usuario actual.
 *
 * Al activarlos se completa `terms_accepted_at` si faltaba: activar el toggle
 * implica haber aceptado los Términos (el texto está enlazado en /perfil).
 * Solo toca la fila propia; RLS lo impone.
 */
export async function setEmailPreference(
  optIn: boolean,
): Promise<EmailPreferenceResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "No autenticado" };

  const update: Record<string, unknown> = { email_opt_in: Boolean(optIn) };
  if (optIn) {
    update.terms_accepted_at = new Date().toISOString();
    update.terms_version = TERMS_VERSION;
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: "No se pudo guardar la preferencia." };
  }

  revalidatePath("/perfil");
  return { ok: true, optIn: Boolean(optIn) };
}
