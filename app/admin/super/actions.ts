"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ASSIGNABLE_ROLES,
  EMAIL_RE,
  LICENSE_PLANS,
  UUID_RE,
  USERS_PAGE_SIZE,
  type AssignableRole,
  type LicensePlan,
} from "@/lib/superadmin";

export type ActionResult =
  | { ok: true; count?: number; message?: string; code?: string }
  | { ok: false; error: string };

export interface SuperAdminUserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  created_at: string;
  admin_request_status: string | null;
}

/** Escapa los comodines de LIKE para que la entrada sea literal. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Sanea un término para usarlo dentro de un filtro `or()` de PostgREST,
 * cuya gramática usa comas, paréntesis y comillas como separadores.
 */
function sanitizeOrTerm(value: string): string {
  return value.replace(/[,()"\\]/g, " ").replace(/\s+/g, " ").trim();
}

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

interface TargetProfile {
  id: string;
  email: string | null;
  role: string;
  admin_request_status: string | null;
  role_requested: boolean | null;
  dni_front_url: string | null;
  face_url: string | null;
}

/**
 * Carga los perfiles destino y descarta los que el actor no puede tocar.
 * Reglas: nunca a sí mismo, nunca a otro superadmin.
 */
async function loadTargets(
  actorId: string,
  userIds: string[],
): Promise<
  | { ok: false; error: string }
  | { ok: true; targets: TargetProfile[]; skipped: number }
> {
  const ids = Array.from(new Set(userIds.filter((id) => UUID_RE.test(id)))).filter(
    (id) => id !== actorId,
  );
  if (ids.length === 0) {
    return { ok: false, error: "Selección inválida (no incluyas tu propio usuario)" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, email, role, admin_request_status, role_requested, dni_front_url, face_url",
    )
    .in("id", ids);

  if (error) return { ok: false, error: error.message };

  const all = (data ?? []) as TargetProfile[];
  const targets = all.filter((t) => t.role !== "superadmin");
  if (targets.length === 0) {
    return { ok: false, error: "No se puede modificar a un superadmin" };
  }

  return { ok: true, targets, skipped: all.length - targets.length };
}

/**
 * Estado de solicitud coherente tras un cambio de rol manual.
 * Si había una solicitud abierta, se resuelve; si no, se limpia.
 */
function requestStateFor(
  target: Pick<TargetProfile, "admin_request_status" | "role_requested">,
  outcome: "approved" | "none",
) {
  const hadOpenRequest =
    target.admin_request_status === "pending" || target.role_requested === true;

  if (outcome === "none" || !hadOpenRequest) {
    return {
      role_requested: false,
      role_request_status: "none" as const,
      admin_request_status: "none" as const,
    };
  }

  return {
    role_requested: false,
    role_request_status: "approved" as const,
    admin_request_status: "approved" as const,
  };
}

function revalidateAdminViews() {
  revalidatePath("/admin/super");
  revalidatePath("/admin");
  revalidatePath("/", "layout");
}

async function logAction(params: {
  adminId: string;
  adminEmail: string | null;
  action: string;
  targetUserId: string | null;
  targetEmail: string | null;
  details: Record<string, unknown>;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("admin_audit_logs").insert({
    admin_id: params.adminId,
    admin_email: params.adminEmail,
    action: params.action,
    target_user_id: params.targetUserId,
    target_email: params.targetEmail,
    details: JSON.stringify(params.details),
  });

  // La operación ya se aplicó: si falla el log no se revierte, pero no puede
  // quedar en silencio (antes el error se descartaba por completo).
  if (error) {
    console.error("[logAction] no se pudo registrar la auditoría:", error.message, {
      action: params.action,
      targetUserId: params.targetUserId,
    });
  }
}

// =====================================================================
// Listado paginado de usuarios (búsqueda en servidor)
// =====================================================================

export interface ListUsersResult {
  ok: boolean;
  error?: string;
  users: SuperAdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: { user: number; admin: number; superadmin: number };
}

const EMPTY_COUNTS = { user: 0, admin: 0, superadmin: 0 };

/**
 * Devuelve una página de perfiles con búsqueda por nombre/email en la base.
 * Antes la tabla cargaba como mucho 1000 filas y filtraba en el navegador,
 * así que los usuarios más antiguos eran invisibles.
 */
export async function listUsers(params: {
  q?: string;
  page?: number;
  role?: string;
} = {}): Promise<ListUsersResult> {
  const adminUser = await getAdmin();
  const pageSize = USERS_PAGE_SIZE;
  const page = Math.max(1, Math.floor(Number(params.page) || 1));

  if (!adminUser) {
    return {
      ok: false,
      error: "No autorizado",
      users: [],
      total: 0,
      page: 1,
      pageSize,
      counts: EMPTY_COUNTS,
    };
  }

  const admin = createAdminClient();
  const query = (params.q ?? "").trim();
  const roleFilter = ASSIGNABLE_ROLES.includes(params.role as AssignableRole)
    ? (params.role as AssignableRole)
    : null;

  let request = admin
    .from("profiles")
    .select(
      "id, full_name, email, role, created_at, admin_request_status",
      { count: "exact" },
    );

  if (roleFilter) request = request.eq("role", roleFilter);

  if (query) {
    // Dos campos: nombre visible y email.
    if (EMAIL_RE.test(query)) {
      request = request.ilike("email", `%${escapeLike(query)}%`);
    } else {
      const term = sanitizeOrTerm(query);
      if (term) {
        request = request.or(
          `full_name.ilike.%${term}%,email.ilike.%${term}%`,
        );
      }
    }
  }

  const from = (page - 1) * pageSize;
  const { data, count, error } = await request
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    return {
      ok: false,
      error: error.message,
      users: [],
      total: 0,
      page,
      pageSize,
      counts: EMPTY_COUNTS,
    };
  }

  // Contadores por rol (independientes del filtro: sirven de resumen).
  const countRole = async (role: AssignableRole): Promise<number> => {
    const { count: n } = await admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", role);
    return n ?? 0;
  };

  const [userCount, adminCount, superCount] = await Promise.all([
    countRole("user"),
    countRole("admin"),
    countRole("superadmin"),
  ]);

  return {
    ok: true,
    users: (data ?? []) as SuperAdminUserRow[],
    total: count ?? 0,
    page,
    pageSize,
    counts: { user: userCount, admin: adminCount, superadmin: superCount },
  };
}

// =====================================================================
// Solicitudes de organizador
// =====================================================================

export async function approveRoleRequest(userId: string): Promise<ActionResult> {
  const adminUser = await getAdmin();
  if (!adminUser) return { ok: false, error: "No autorizado" };
  if (!UUID_RE.test(userId)) return { ok: false, error: "Usuario inválido" };
  if (userId === adminUser.id)
    return { ok: false, error: "No podés cambiar tu propio rol" };

  const admin = createAdminClient();
  const { data: target, error: findError } = await admin
    .from("profiles")
    .select("id, email, role")
    .eq("id", userId)
    .maybeSingle();

  if (findError) return { ok: false, error: findError.message };
  if (!target) return { ok: false, error: "Usuario no encontrado" };
  // Antes esta acción forzaba role='admin' sin mirar el rol actual: un
  // superadmin con solicitud pendiente quedaba degradado.
  if (target.role === "superadmin")
    return { ok: false, error: "No se puede modificar a un superadmin" };

  const { data: updated, error } = await admin
    .from("profiles")
    .update({
      role: "admin",
      role_requested: false,
      role_request_status: "approved",
      admin_request_status: "approved",
    })
    .eq("id", userId)
    .neq("role", "superadmin")
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0)
    return { ok: false, error: "No se pudo aprobar: el usuario es superadmin" };

  await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "APPROVE_ROLE",
    targetUserId: userId,
    targetEmail: target.email ?? null,
    details: { to: "admin" },
  });

  revalidateAdminViews();
  return { ok: true };
}

export async function rejectRoleRequest(userId: string): Promise<ActionResult> {
  const adminUser = await getAdmin();
  if (!adminUser) return { ok: false, error: "No autorizado" };
  if (!UUID_RE.test(userId)) return { ok: false, error: "Usuario inválido" };

  const admin = createAdminClient();
  const { data: target, error: findError } = await admin
    .from("profiles")
    .select("id, email, role")
    .eq("id", userId)
    .maybeSingle();

  if (findError) return { ok: false, error: findError.message };
  if (!target) return { ok: false, error: "Usuario no encontrado" };
  if (target.role === "superadmin")
    return { ok: false, error: "No se puede modificar a un superadmin" };

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
    targetEmail: target.email ?? null,
    details: { to: "user" },
  });

  revalidateAdminViews();
  return { ok: true };
}

// =====================================================================
// Gestión de roles
// =====================================================================

export async function setUserRole(
  userId: string,
  role: AssignableRole,
): Promise<ActionResult> {
  const adminUser = await getAdmin();
  if (!adminUser) return { ok: false, error: "No autorizado" };
  if (!ASSIGNABLE_ROLES.includes(role))
    return { ok: false, error: "Rol inválido" };
  if (!UUID_RE.test(userId)) return { ok: false, error: "Usuario inválido" };
  if (userId === adminUser.id)
    return { ok: false, error: "No podés cambiar tu propio rol" };

  const admin = createAdminClient();
  const { data: target, error: findError } = await admin
    .from("profiles")
    .select("id, email, role, admin_request_status, role_requested")
    .eq("id", userId)
    .maybeSingle();

  if (findError) return { ok: false, error: findError.message };
  if (!target) return { ok: false, error: "Usuario no encontrado" };
  if (target.role === "superadmin")
    return { ok: false, error: "No se puede modificar a otro superadmin" };
  if (target.role === role)
    return { ok: true, message: "El usuario ya tiene ese rol" };

  const requestState = requestStateFor(
    target,
    role === "user" ? "none" : "approved",
  );

  const { data: updated, error } = await admin
    .from("profiles")
    .update({ role, ...requestState })
    .eq("id", userId)
    // Doble red: si entre la lectura y la escritura el usuario pasó a ser
    // superadmin, la fila no coincide y no se toca.
    .neq("role", "superadmin")
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0)
    return {
      ok: false,
      error: "No se aplicó el cambio: el usuario ya no admite modificaciones",
    };

  await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "CHANGE_ROLE",
    targetUserId: userId,
    targetEmail: target.email ?? null,
    details: { from: target.role, to: role, via: "row" },
  });

  revalidateAdminViews();
  return { ok: true };
}

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
  if (isEmail && !EMAIL_RE.test(term)) {
    return { ok: false, error: "El email ingresado no es válido" };
  }

  const admin = createAdminClient();

  let target:
    | {
        id: string;
        email: string | null;
        role: string;
        admin_request_status: string | null;
        role_requested: boolean | null;
      }
    | null = null;

  if (isEmail) {
    // `ilike` con el término escapado: sin escapar, un "%" en la entrada
    // podía resolver cualquier fila y conceder el rol a otra persona.
    const { data: byEmail, error: emailError } = await admin
      .from("profiles")
      .select("id, email, role, admin_request_status, role_requested")
      .ilike("email", escapeLike(term))
      .limit(1)
      .maybeSingle();

    if (emailError) return { ok: false, error: emailError.message };
    target = byEmail;
  } else {
    const { data: byId, error: idError } = await admin
      .from("profiles")
      .select("id, email, role, admin_request_status, role_requested")
      .eq("id", term)
      .maybeSingle();

    if (idError) return { ok: false, error: idError.message };
    target = byId;
  }

  // --- Usuario existente: asignar rol directamente ---
  if (target) {
    if (target.id === adminUser.id)
      return { ok: false, error: "Ese usuario sos vos (ya sos superadmin)" };
    if (target.role === "superadmin")
      return { ok: false, error: "Ese usuario ya es superadmin" };
    if (target.role === "admin")
      return { ok: false, error: "Ese usuario ya es organizador" };

    const requestState = requestStateFor(target, "approved");

    const { error } = await admin
      .from("profiles")
      .update({ role: "admin", ...requestState })
      .eq("id", target.id)
      .neq("role", "superadmin");

    if (error) return { ok: false, error: error.message };

    await logAction({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      action: "CREATE_ORGANIZER",
      targetUserId: target.id,
      targetEmail: target.email,
      details: { via: "manual", input: term },
    });

    revalidateAdminViews();
    return { ok: true, mode: "assigned", userId: target.id };
  }

  // --- Usuario nuevo: pre-asignación por invitación ---
  if (!isEmail) {
    return { ok: false, error: "No se encontró un usuario con ese ID" };
  }

  // Guarda la pre-asignación. Si la tabla todavía no existe en la BD,
  // NO se rompe el flujo: se sigue con el envío del correo.
  let invitationStored = true;
  let inviteCheckError: string | null = null;

  try {
    const { data: existingInv, error: selectError } = await admin
      .from("organizer_invitations")
      .select("id, status")
      .ilike("email", escapeLike(term))
      .maybeSingle();

    if (selectError) throw selectError;

    if (existingInv && existingInv.status === "pending") {
      invitationStored = true;
    } else if (existingInv) {
      const { error: updateError } = await admin
        .from("organizer_invitations")
        .update({
          status: "pending",
          invited_by: adminUser.id,
          accepted_at: null,
        })
        .eq("id", existingInv.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await admin
        .from("organizer_invitations")
        .insert({ email: term, invited_by: adminUser.id, status: "pending" });
      if (insertError) throw insertError;
    }
  } catch (e) {
    invitationStored = false;
    inviteCheckError =
      e instanceof Error
        ? e.message
        : "No se pudo registrar la invitación pendiente";
    console.error(
      "[createOrganizer] organizer_invitations no disponible:",
      inviteCheckError,
    );
  }

  // Envío del correo de invitación (Supabase Auth / SMTP configurado).
  let emailSent = false;
  let emailError: string | null = null;

  try {
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      term,
      { redirectTo: `${process.env.NEXT_PUBLIC_URL ?? ""}/auth/callback` },
    );
    if (inviteError) {
      emailError = friendlyInviteError(inviteError.message);
    } else {
      emailSent = true;
    }
  } catch (e) {
    emailError = friendlyInviteError(
      e instanceof Error ? e.message : "Error desconocido al enviar el correo",
    );
  }

  await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "INVITE_ORGANIZER",
    targetUserId: null,
    targetEmail: term,
    details: { invitationStored, emailSent, emailError },
  });

  revalidateAdminViews();

  if (emailSent) {
    return {
      ok: true,
      mode: "invited",
      emailSent: true,
      message: "Invitación enviada por correo.",
    };
  }

  return {
    ok: true,
    mode: "invited",
    emailSent: false,
    message: invitationStored
      ? `Invitación registrada. No se pudo enviar el correo${
          emailError ? `: ${emailError}` : ""
        }. El rol se aplicará en su primer inicio de sesión.`
      : `Pre-asignación no guardada (falta aplicar la migración 0021)${
          emailError ? ` y el correo falló: ${emailError}` : ""
        }.`,
  };
}

// Traduce los errores crudos de Supabase Auth a mensajes accionables.
function friendlyInviteError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("already") && (m.includes("registered") || m.includes("exists"))) {
    return "ese email ya tiene una cuenta (asignale el rol directamente)";
  }
  if (m.includes("smtp") || m.includes("sending") || m.includes("email")) {
    return "el servicio de correo (SMTP) no está configurado en Supabase";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "se superó el límite de envíos; probá más tarde";
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "el email ingresado no es válido";
  }
  return message;
}

// =====================================================================
// Acciones en lote
// =====================================================================

/** Revoca el rol de organizador (lote): admin -> user. */
export async function demoteOrganizers(userIds: string[]): Promise<ActionResult> {
  const adminUser = await getAdmin();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  const loaded = await loadTargets(adminUser.id, userIds);
  if (!loaded.ok) return loaded;

  const valid = loaded.targets.filter((t) => t.role === "admin");
  if (valid.length === 0)
    return { ok: false, error: "No hay organizadores seleccionados" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    // Al degradar se limpia el estado de solicitud: si no, el usuario seguía
    // apareciendo en "Aprobadas" y el formulario público le decía
    // "✓ Ya sos organizador", impidiéndole volver a solicitar.
    .update({
      role: "user",
      role_requested: false,
      role_request_status: "none",
      admin_request_status: "none",
    })
    .in(
      "id",
      valid.map((t) => t.id),
    );

  if (error) return { ok: false, error: error.message };

  for (const t of valid) {
    await logAction({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      action: "CHANGE_ROLE",
      targetUserId: t.id,
      targetEmail: t.email,
      details: { to: "user", via: "revoke" },
    });
  }

  revalidateAdminViews();
  return { ok: true, count: valid.length };
}

/** Verifica si un email ya está registrado (para el label del modal). */
export async function checkEmailRegistered(email: string) {
  const adminUser = await getAdmin();
  if (!adminUser) return { ok: false, registered: false };

  const term = email.trim().toLowerCase();
  if (!term || !EMAIL_RE.test(term)) return { ok: true, registered: false };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", escapeLike(term))
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, registered: false };
  return { ok: true, registered: Boolean(data) };
}

/** Bloqueo permanente: ban de auth.users (~100 años) + demote. */
export async function blockUsers(userIds: string[]): Promise<ActionResult> {
  const adminUser = await getAdmin();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  const loaded = await loadTargets(adminUser.id, userIds);
  if (!loaded.ok) return loaded;

  const admin = createAdminClient();
  let count = 0;
  let lastError: string | null = null;

  for (const t of loaded.targets) {
    const { error } = await admin.auth.admin.updateUserById(t.id, {
      ban_duration: "876000h",
    });
    if (error) {
      lastError = error.message;
      continue;
    }

    const { error: demoteError } = await admin
      .from("profiles")
      .update({
        role: "user",
        role_requested: false,
        role_request_status: "none",
        admin_request_status: "none",
      })
      .eq("id", t.id);

    if (demoteError) {
      // El usuario queda baneado pero conserva el rol: hay que reportarlo.
      lastError = `Bloqueado pero no se pudo quitar el rol: ${demoteError.message}`;
      continue;
    }

    count += 1;
    await logAction({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      action: "BLOCK_USER",
      targetUserId: t.id,
      targetEmail: t.email,
      details: { ban_duration: "876000h" },
    });
  }

  revalidateAdminViews();

  if (count === 0)
    return { ok: false, error: lastError ?? "No se pudo bloquear" };
  return { ok: true, count };
}

/** Eliminación (lote) de usuarios de auth (cascadea el perfil). */
export async function deleteUsers(userIds: string[]): Promise<ActionResult> {
  const adminUser = await getAdmin();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  const loaded = await loadTargets(adminUser.id, userIds);
  if (!loaded.ok) return loaded;

  const admin = createAdminClient();
  let count = 0;
  let lastError: string | null = null;

  for (const t of loaded.targets) {
    // Privacidad: los documentos KYC viven en un bucket privado y NO se
    // borran con el usuario; hay que eliminarlos explícitamente.
    const files = [t.dni_front_url, t.face_url].filter(
      (f): f is string => Boolean(f),
    );
    if (files.length > 0) {
      const { error: storageError } = await admin.storage
        .from("organizer-kyc")
        .remove(files);
      if (storageError) {
        console.error(
          "[deleteUsers] no se pudieron borrar los archivos KYC:",
          storageError.message,
        );
      }
    }

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
      targetUserId: null,
      targetEmail: t.email,
      details: { deletedUserId: t.id, role: t.role, kycFiles: files.length },
    });
  }

  revalidateAdminViews();

  if (count === 0) return { ok: false, error: lastError ?? "No se pudo eliminar" };
  return { ok: true, count };
}

// =====================================================================
// Licencias
// =====================================================================

// Genera un código de licencia de 25 caracteres (solo superadmin).
export async function generateLicenseCode(
  plan: string = "organizador",
): Promise<ActionResult> {
  const adminUser = await getAdmin();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  if (!LICENSE_PLANS.includes(plan as LicensePlan)) {
    return { ok: false, error: "Plan inválido" };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_license_code", {
    p_plan: plan,
  });

  if (error) {
    return {
      ok: false,
      error: "No se pudo generar el código. ¿Aplicaste la migración 0022?",
    };
  }

  await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "GENERATE_LICENSE",
    targetUserId: null,
    targetEmail: null,
    details: { plan },
  });

  revalidatePath("/admin/super");
  return { ok: true, code: data as string };
}

// Revoca un código de licencia activo (solo superadmin).
// `codeId` acepta el UUID del código o el propio código alfanumérico.
export async function revokeLicenseCode(codeId: string): Promise<ActionResult> {
  const adminUser = await getAdmin();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  const term = codeId.trim();
  if (!term) return { ok: false, error: "Código inválido" };

  const admin = createAdminClient();
  const byId = UUID_RE.test(term);

  const base = admin
    .from("license_codes")
    .update({ status: "revoked" })
    .eq("status", "active");

  const { data, error } = byId
    ? await base.eq("id", term).select("code")
    : await base.eq("code", term).select("code");

  if (error) return { ok: false, error: error.message };

  const affected = Array.isArray(data) ? data.length : 0;
  if (affected === 0) {
    return {
      ok: false,
      error: "No se encontró un código activo para revocar",
    };
  }

  await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "REVOKE_LICENSE",
    targetUserId: null,
    targetEmail: null,
    details: { codeId: term, affected },
  });

  revalidatePath("/admin/super");
  return { ok: true, count: affected };
}
