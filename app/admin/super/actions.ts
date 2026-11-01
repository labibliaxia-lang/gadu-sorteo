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
  targetUserId: string | null;
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

// Alta manual de organizador por email o id (UUID). Si el email no existe,
// crea una pre-asignación (invitación) que se aplica en el primer login.
export async function createOrganizer(input: string): Promise<{
  ok: boolean;
  error?: string;
  mode?: "assigned" | "invited" | "already-invited";
  emailSent?: boolean;
  userId?: string;
  message?: string;
}> {
  const adminUser = await getAdmin();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  const term = input.trim();
  if (!term) return { ok: false, error: "Ingresá un email o ID" };

  const isEmail = term.includes("@");
  const isUuid = UUID_RE.test(term);
  if (!isEmail && !isUuid) {
    return { ok: false, error: "Ingresá un email válido o un ID (UUID)" };
  }

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

  // --- Usuario existente: asignar rol directamente ---
  if (target) {
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
    return { ok: true, mode: "assigned", userId: target.id };
  }

  // --- Usuario nuevo: pre-asignación por invitación ---
  if (!isEmail) {
    return { ok: false, error: "No se encontró un usuario con ese ID" };
  }

  const { data: existingInv } = await admin
    .from("organizer_invitations")
    .select("id, status")
    .ilike("email", term)
    .maybeSingle();

  if (existingInv && existingInv.status === "pending") {
    return {
      ok: true,
      mode: "already-invited",
      message: "Ya existe una invitación pendiente para ese email.",
    };
  }

  if (existingInv) {
    await admin
      .from("organizer_invitations")
      .update({
        status: "pending",
        invited_by: adminUser.id,
        accepted_at: null,
      })
      .eq("id", existingInv.id);
  } else {
    const { error: invError } = await admin
      .from("organizer_invitations")
      .insert({ email: term, invited_by: adminUser.id, status: "pending" });
    if (invError) return { ok: false, error: invError.message };
  }

  // Best-effort: envía el correo de invitación (si el SMTP está configurado).
  let emailSent = false;
  try {
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      term,
    );
    if (!inviteError) emailSent = true;
  } catch {
    // SMTP no configurado o usuario ya existente: se aplica al primer login.
  }

  await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "INVITE_ORGANIZER",
    targetUserId: null,
    targetEmail: term,
    details: JSON.stringify({ invited: true, emailSent }),
  });

  revalidatePath("/admin/super");
  revalidatePath("/", "layout");
  return {
    ok: true,
    mode: "invited",
    emailSent,
    message: emailSent
      ? "Invitación creada y correo enviado."
      : "Invitación creada. Se asignará el rol al primer inicio de sesión.",
  };
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
