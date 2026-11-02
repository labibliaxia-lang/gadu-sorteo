"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type RedeemResult = {
  ok: boolean;
  plan?: string | null;
  message: string;
};

export async function redeemLicenseCode(formData: FormData): Promise<RedeemResult> {
  const raw = String(formData.get("code") ?? "").trim();

  if (!raw) {
    return { ok: false, message: "Ingresá un código." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      message: "Debés iniciar sesión para canjear un código.",
    };
  }

  const { data, error } = await supabase.rpc("redeem_license_code", {
    p_code: raw,
  });

  if (error) {
    return {
      ok: false,
      message: "No se pudo validar el código. Intentá nuevamente.",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    return { ok: false, message: "No se pudo canjear el código." };
  }

  // RSC: refresca el canje y el panel (el rol pudo cambiar a organizador).
  revalidatePath("/planes");
  revalidatePath("/admin");
  revalidatePath("/", "layout");

  return {
    ok: Boolean(row.ok),
    plan: row.plan ?? null,
    message: row.message ?? "Código procesado.",
  };
}
