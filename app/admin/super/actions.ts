"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function isAdmin(): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return profile?.role === "admin";
}

export async function approveRoleRequest(userId: string) {
  if (!(await isAdmin())) {
    return { ok: false, error: "No autorizado" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role: "admin", role_requested: false })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/super");
  return { ok: true };
}

export async function rejectRoleRequest(userId: string) {
  if (!(await isAdmin())) {
    return { ok: false, error: "No autorizado" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role_requested: false })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/super");
  return { ok: true };
}
