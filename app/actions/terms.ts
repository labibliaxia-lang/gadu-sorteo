"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION, termsVersionSchema } from "@/lib/terms";

export type AcceptTermsResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Registra la aceptación explícita de los Términos para el usuario logueado.
 * La fecha la pone la base; la versión se valida contra la vigente.
 */
export async function acceptTerms(
  version: string = TERMS_VERSION,
): Promise<AcceptTermsResult> {
  const parsed = termsVersionSchema.safeParse(version);
  if (!parsed.success) {
    return { ok: false, error: "Versión de términos inválida." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Iniciá sesión para continuar." };

  const { error } = await supabase
    .from("profiles")
    .update({
      terms_accepted_at: new Date().toISOString(),
      terms_version: parsed.data,
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
