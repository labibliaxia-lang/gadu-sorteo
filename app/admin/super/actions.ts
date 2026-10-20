"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function getAdmin(): Promise<{
  id: string;
  email: string | null;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "superadmin") return null;
  return { id: user.id, email: profile.email ?? user.email ?? null };
}

async function logAction(params: {
  adminId: string;
  adminEmail: string | null;
  action: string;
  targetUserId: string;
  targetEmail: string | null;
  details: string;
}) {
  const admin = createAdminClient();
  await admin.from("admin_audit_logs").insert({
    admin_id: params.adminId,
    admin_email: params.adminEmail,
    action: params.action,
    target_user_id: params.targetUserId,
    target_email: params.targetEmail,
    details: params.details,
  });
}

async function targetEmail(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();
  return data?.email ?? null;
}

export async function approveRoleRequest(userId: string) {
  const adminUser = await getAdmin();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  const admin = createAdminClient();
  const email = await targetEmail(admin, userId);

  const { error } = await admin
    .from("profiles")
    .update({
      role: "admin",
      role_requested: false,
      role_request_status: "approved",
      admin_request_status: "approved",
    })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };

  await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "APPROVE_ROLE",
    targetUserId: userId,
    targetEmail: email,
    details: JSON.stringify({ to: "admin" }),
  });

  revalidatePath("/admin/super");
  return { ok: true };
}

export async function rejectRoleRequest(userId: string) {
  const adminUser = await getAdmin();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  const admin = createAdminClient();
  const email = await targetEmail(admin, userId);

  const { error } = await admin
    .from("profiles")
    .update({
      role_requested: false,
      role_request_status: "rejected",
      admin_request_status: "rejected",
    })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };

  await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "REJECT_ROLE",
    targetUserId: userId,
    targetEmail: email,
    details: JSON.stringify({ to: "user" }),
  });

  revalidatePath("/admin/super");
  return { ok: true };
}

export async function setUserRole(userId: string, role: "user" | "admin") {
  const adminUser = await getAdmin();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  const admin = createAdminClient();
  const email = await targetEmail(admin, userId);

  const { error } = await admin
    .from("profiles")
    .update({ role, role_requested: false })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };

  await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "CHANGE_ROLE",
    targetUserId: userId,
    targetEmail: email,
    details: JSON.stringify({ to: role }),
  });

  revalidatePath("/admin/super");
  return { ok: true };
}
