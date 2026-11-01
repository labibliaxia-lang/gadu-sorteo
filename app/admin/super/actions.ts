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
  revalidatePath("/", "layout");
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
  revalidatePath("/", "layout");
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
  revalidatePath("/", "layout");
  return { ok: true };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Alta manual de organizador por email o id (UUID).
export async function createOrganizer(input: string) {
  const adminUser = await getAdmin();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  const term = input.trim();
  if (!term) return { ok: false, error: "Ingresá un email o ID" };

  const admin = createAdminClient();

  let target: { id: string; email: string | null; role: string } | null = null;

  const { data: byEmail } = await admin
    .from("profiles")
    .select("id, email, role")
    .ilike("email", term)
    .maybeSingle();

  if (byEmail) {
    target = byEmail;
  } else if (UUID_RE.test(term)) {
    const { data: byId } = await admin
      .from("profiles")
      .select("id, email, role")
      .eq("id", term)
      .maybeSingle();
    target = byId;
  }

  if (!target)
    return { ok: false, error: "No se encontró un usuario con ese email/ID" };
  if (target.role === "superadmin")
    return { ok: false, error: "Ese usuario ya es superadmin" };
  if (target.role === "admin")
    return { ok: false, error: "Ese usuario ya es organizador" };

  const { error } = await admin
    .from("profiles")
    .update({
      role: "admin",
      role_requested: false,
      role_request_status: "approved",
      admin_request_status: "approved",
    })
    .eq("id", target.id);

  if (error) return { ok: false, error: error.message };

  await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "CREATE_ORGANIZER",
    targetUserId: target.id,
    targetEmail: target.email,
    details: JSON.stringify({ via: "manual", input: term }),
  });

  revalidatePath("/admin/super");
  revalidatePath("/", "layout");
  return { ok: true, userId: target.id };
}

// Suspensión (lote): quita el rol de organizador (role -> user).
export async function suspendUsers(userIds: string[]) {
  const adminUser = await getAdmin();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  const ids = userIds.filter((id) => id !== adminUser.id);
  if (ids.length === 0) return { ok: false, error: "Selección inválida" };

  const admin = createAdminClient();
  const { data: targets } = await admin
    .from("profiles")
    .select("id, email, role")
    .in("id", ids);

  const valid = (targets ?? []).filter((t) => t.role !== "superadmin");
  if (valid.length === 0)
    return { ok: false, error: "No se puede suspender al superadmin" };

  const validIds = valid.map((t) => t.id);
  const { error } = await admin
    .from("profiles")
    .update({ role: "user" })
    .in("id", validIds);

  if (error) return { ok: false, error: error.message };

  for (const t of valid) {
    await logAction({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      action: "SUSPEND_USER",
      targetUserId: t.id,
      targetEmail: t.email,
      details: JSON.stringify({ to: "user" }),
    });
  }

  revalidatePath("/admin/super");
  revalidatePath("/", "layout");
  return { ok: true, count: valid.length };
}

// Eliminación (lote) de usuarios de auth (cascadea el perfil).
export async function deleteUsers(userIds: string[]) {
  const adminUser = await getAdmin();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  const ids = userIds.filter((id) => id !== adminUser.id);
  if (ids.length === 0) return { ok: false, error: "Selección inválida" };

  const admin = createAdminClient();
  const { data: targets } = await admin
    .from("profiles")
    .select("id, email, role")
    .in("id", ids);

  const valid = (targets ?? []).filter((t) => t.role !== "superadmin");
  if (valid.length === 0)
    return { ok: false, error: "No se puede eliminar al superadmin" };

  let count = 0;
  let lastError: string | null = null;

  for (const t of valid) {
    const { error } = await admin.auth.admin.deleteUser(t.id);
    if (error) {
      lastError = error.message;
      continue;
    }
    count += 1;
    await logAction({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      action: "DELETE_USER",
      targetUserId: t.id,
      targetEmail: t.email,
      details: JSON.stringify({ by: adminUser.id }),
    });
  }

  revalidatePath("/admin/super");
  revalidatePath("/", "layout");

  if (count === 0) return { ok: false, error: lastError ?? "No se pudo eliminar" };
  return { ok: true, count };
}
