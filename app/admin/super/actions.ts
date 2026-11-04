"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSuperadminSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ASSIGNABLE_ROLES,
  EMAIL_RE,
  LICENSE_PLANS,
  UUID_RE,
  USERS_PAGE_SIZE,
  canDemoteSuperadmin,
  licenseBenefit,
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
  is_banned: boolean;
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

interface TargetProfile {
  id: string;
  email: string | null;
  role: string;
  admin_request_status: string | null;
  role_requested: boolean | null;
  dni_front_url: string | null;
  dni_back_url: string | null;
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
      "id, email, role, admin_request_status, role_requested, dni_front_url, dni_back_url, face_url",
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

/** Cantidad de superadmins actuales, o null si no se pudo contar. */
async function countSuperadmins(): Promise<number | null> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "superadmin");

  if (error) {
    console.error("[countSuperadmins] no se pudo contar:", error.message);
    return null;
  }
  return count ?? 0;
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
  const adminUser = await requireSuperadminSession();
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
      "id, full_name, email, role, created_at, admin_request_status, is_banned",
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
  const adminUser = await requireSuperadminSession();
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
  const adminUser = await requireSuperadminSession();
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
  const adminUser = await requireSuperadminSession();
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

  const demotingSuperadmin = target.role === "superadmin";

  if (demotingSuperadmin && role === "superadmin")
    return { ok: true, message: "El usuario ya tiene ese rol" };
  if (!demotingSuperadmin && target.role === role)
    return { ok: true, message: "El usuario ya tiene ese rol" };

  // Degradar un superadmin es posible (antes era irreversible sin SQL), pero
  // nunca a costa de dejar el sistema sin ninguno. Si el conteo falla, se
  // rechaza: ante la duda, no se degrada.
  if (demotingSuperadmin) {
    const remaining = await countSuperadmins();
    if (!canDemoteSuperadmin(remaining)) {
      return {
        ok: false,
        error: "No se puede degradar al último superadmin",
      };
    }
  }

  const requestState = requestStateFor(
    target,
    role === "user" ? "none" : "approved",
  );

  let update = admin
    .from("profiles")
    .update({ role, ...requestState })
    .eq("id", userId);

  // Doble red contra la carrera entre la lectura y la escritura: la fila sólo
  // se toca si el rol sigue siendo el que se leyó.
  update = demotingSuperadmin
    ? update.eq("role", "superadmin")
    : update.neq("role", "superadmin");

  const { data: updated, error } = await update.select("id");

  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0)
    return {
      ok: false,
      error: "No se aplicó el cambio: el usuario ya no admite modificaciones",
    };

  // Segunda comprobación: si dos degradaciones simultáneas pasaron el control
  // previo, se deshace el cambio antes que quedarse sin superadmins.
  if (demotingSuperadmin) {
    const after = await countSuperadmins();
    if (after === 0) {
      await admin
        .from("profiles")
        .update({ role: "superadmin" })
        .eq("id", userId);
      return {
        ok: false,
        error: "No se aplicó: el sistema quedaría sin ningún superadmin",
      };
    }
  }

  await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "CHANGE_ROLE",
    targetUserId: userId,
    targetEmail: target.email ?? null,
    details: {
      from: target.role,
      to: role,
      via: "row",
      ...(demotingSuperadmin ? { demotion: "superadmin" } : {}),
    },
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
  const adminUser = await requireSuperadminSession();
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
  const adminUser = await requireSuperadminSession();
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
  const adminUser = await requireSuperadminSession();
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
  const adminUser = await requireSuperadminSession();
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
        is_banned: true,
        banned_at: new Date().toISOString(),
        ban_reason: "Bloqueo permanente desde el panel",
        banned_by: adminUser.id,
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
  const adminUser = await requireSuperadminSession();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  const loaded = await loadTargets(adminUser.id, userIds);
  if (!loaded.ok) return loaded;

  const admin = createAdminClient();
  let count = 0;
  let lastError: string | null = null;

  for (const t of loaded.targets) {
    // Privacidad: los documentos KYC viven en un bucket privado y NO se borran
    // con el usuario. Las rutas se capturan antes (loadTargets) y los archivos
    // se eliminan DESPUÉS de borrar la cuenta: si se borraran primero y el
    // deleteUser fallara, se perdía la evidencia sin haber eliminado al usuario.
    const files = [t.dni_front_url, t.dni_back_url, t.face_url].filter(
      (f): f is string => Boolean(f),
    );

    const { error } = await admin.auth.admin.deleteUser(t.id);
    if (error) {
      lastError = error.message;
      continue;
    }
    count += 1;

    let kycPurged = false;
    if (files.length > 0) {
      const { error: storageError } = await admin.storage
        .from("organizer-kyc")
        .remove(files);
      if (storageError) {
        // La cuenta ya no existe: queda un archivo huérfano, no un usuario sin
        // evidencia. Se reporta para poder purgarlo a mano.
        console.error(
          "[deleteUsers] la cuenta se eliminó pero quedaron archivos KYC:",
          storageError.message,
          { userId: t.id, files },
        );
      } else {
        kycPurged = true;
      }
    }

    await logAction({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      action: "DELETE_USER",
      targetUserId: null,
      targetEmail: t.email,
      details: {
        deletedUserId: t.id,
        role: t.role,
        kycFiles: files.length,
        kycPurged,
      },
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
  const adminUser = await requireSuperadminSession();
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
  const adminUser = await requireSuperadminSession();
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

// ---------------------------------------------------------------------
// Quitar el beneficio que un código YA CANJEADO otorgó.
//
// Es una acción distinta de anular el código: anular impide volver a
// canjearlo; esto revierte lo que se otorgó. Antes no existía, así que
// "revocar" prometía algo que no hacía.
//
// Límites conocidos, dichos en la UI antes de confirmar:
//   * No restaura un estado anterior (no está registrado): quita el beneficio
//     actual. premium -> organizador (los dos únicos valores del CHECK de 0023)
//     y admin -> user.
//   * No distingue si el rol lo dio este código o una asignación manual.
//   * No cierra sorteos ya publicados: sólo impide publicar más allá del límite
//     del plan resultante (enforce_plan_raffle_limit).
// ---------------------------------------------------------------------
export async function revokeLicenseBenefit(
  codeId: string,
): Promise<ActionResult> {
  const adminUser = await requireSuperadminSession();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  const term = codeId.trim();
  if (!term) return { ok: false, error: "Código inválido" };

  const admin = createAdminClient();
  const byId = UUID_RE.test(term);

  const { data, error } = byId
    ? await admin
        .from("license_codes")
        .select("id, code, plan, status, redeemed_by")
        .eq("id", term)
        .maybeSingle()
    : await admin
        .from("license_codes")
        .select("id, code, plan, status, redeemed_by")
        .eq("code", term)
        .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No se encontró el código" };
  if (!data.redeemed_by) {
    return { ok: false, error: "Ese código no fue canjeado por nadie" };
  }

  const benefit = licenseBenefit(String(data.plan ?? ""));
  if (!benefit) {
    return { ok: false, error: `Plan desconocido en el código: ${data.plan}` };
  }

  // El segundo `eq` es la guarda: sólo se toca la fila si hoy tiene el valor
  // que el código otorgó. Nunca toca a un superadmin (nunca es `admin`).
  const { data: updated, error: updateError } = await admin
    .from("profiles")
    .update({ [benefit.field]: benefit.to })
    .eq("id", data.redeemed_by)
    .eq(benefit.field, benefit.from)
    .select("id");

  if (updateError) return { ok: false, error: updateError.message };

  const applied = Boolean(updated && updated.length > 0);
  const details: Record<string, unknown> = {
    code: data.code,
    plan: data.plan,
    targetUserId: data.redeemed_by,
    from: benefit.from,
    to: benefit.to,
    applied,
  };

  await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "REVOKE_LICENSE_BENEFIT",
    targetUserId: data.redeemed_by,
    targetEmail: null,
    details,
  });

  revalidateAdminViews();

  if (!applied) {
    return {
      ok: true,
      message: "El usuario ya no tenía ese beneficio: no hubo nada que quitar.",
    };
  }

  return {
    ok: true,
    message:
      benefit.field === "plan"
        ? "Plan premium retirado: vuelve a organizador."
        : "Rol de organizador retirado: vuelve a usuario.",
  };
}

// =====================================================================
// Precios mensuales de /planes (migración 0032)
// =====================================================================

const priceSchema = z.coerce
  .number({ invalid_type_error: "Ingresá un precio válido" })
  .min(0, "El precio no puede ser negativo")
  .max(10_000_000, "Precio fuera de rango");

export type PlanPriceResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Actualiza el precio mensual publicado en /planes. Solo superadmin.
 * El precio vive en `plan_prices`; la comisión se acuerda por WhatsApp y no
 * se publica acá.
 */
export async function updatePlanPrice(
  plan: string,
  priceArs: unknown,
): Promise<PlanPriceResult> {
  const adminUser = await requireSuperadminSession();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  if (plan !== "organizador" && plan !== "premium") {
    return { ok: false, error: "Plan inválido" };
  }

  const parsed = priceSchema.safeParse(priceArs);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Precio inválido",
    };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("plan_prices").upsert(
    {
      plan,
      price_ars: parsed.data,
      updated_by: adminUser.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "plan" },
  );

  if (error) return { ok: false, error: error.message };

  await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "UPDATE_PLAN_PRICE",
    targetUserId: null,
    targetEmail: null,
    details: { plan, price_ars: parsed.data },
  });

  revalidatePath("/planes");
  revalidatePath("/admin/super");

  return { ok: true };
}

// =====================================================================
// Soporte: ban / desban individual con motivo (0037)
// =====================================================================

export type BanResult =
  | { ok: true; banned: boolean }
  | { ok: false; error: string };

/**
 * Suspende una cuenta: ban de Auth (~100 años) + marca en el perfil, con
 * motivo y autor. No se puede aplicar a uno mismo ni a otro superadmin.
 */
export async function banUser(
  userId: string,
  reason: string,
): Promise<BanResult> {
  const adminUser = await requireSuperadminSession();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  if (!UUID_RE.test(userId)) return { ok: false, error: "Usuario inválido" };
  if (userId === adminUser.id) {
    return { ok: false, error: "No podés suspender tu propia cuenta." };
  }

  const cleanReason = String(reason ?? "").trim().slice(0, 300);
  if (cleanReason.length < 3) {
    return { ok: false, error: "Indicá un motivo (mínimo 3 caracteres)." };
  }

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, email, role")
    .eq("id", userId)
    .maybeSingle();

  if (targetError) return { ok: false, error: targetError.message };
  if (!target) return { ok: false, error: "Usuario no encontrado." };
  if (target.role === "superadmin") {
    return { ok: false, error: "No se puede suspender a otro superadmin." };
  }

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
  });
  if (authError) return { ok: false, error: authError.message };

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      is_banned: true,
      banned_at: new Date().toISOString(),
      ban_reason: cleanReason,
      banned_by: adminUser.id,
    })
    .eq("id", userId);

  if (profileError) {
    return {
      ok: false,
      error: `Baneado en Auth, pero no se pudo marcar el perfil: ${profileError.message}`,
    };
  }

  await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "BAN_USER",
    targetUserId: userId,
    targetEmail: target.email,
    details: { reason: cleanReason },
  });

  revalidateAdminViews();
  revalidatePath(`/admin/super/usuarios/${userId}`);

  return { ok: true, banned: true };
}

/** Levanta la suspensión: quita el ban de Auth y limpia la marca del perfil. */
export async function unbanUser(userId: string): Promise<BanResult> {
  const adminUser = await requireSuperadminSession();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  if (!UUID_RE.test(userId)) return { ok: false, error: "Usuario inválido" };
  if (userId === adminUser.id) {
    return { ok: false, error: "No podés modificar tu propia cuenta." };
  }

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, email, role")
    .eq("id", userId)
    .maybeSingle();

  if (targetError) return { ok: false, error: targetError.message };
  if (!target) return { ok: false, error: "Usuario no encontrado." };
  if (target.role === "superadmin") {
    return { ok: false, error: "No se puede modificar a otro superadmin." };
  }

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });
  if (authError) return { ok: false, error: authError.message };

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      is_banned: false,
      banned_at: null,
      ban_reason: null,
      banned_by: null,
    })
    .eq("id", userId);

  if (profileError) return { ok: false, error: profileError.message };

  await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "UNBAN_USER",
    targetUserId: userId,
    targetEmail: target.email,
    details: {},
  });

  revalidateAdminViews();
  revalidatePath(`/admin/super/usuarios/${userId}`);

  return { ok: true, banned: false };
}

// =====================================================================
// Soporte: pago manual de plan y extensión de vigencia (0038)
// =====================================================================

export type PlanId = "organizador" | "premium";

export type PlanExtendResult =
  | { ok: true; expiresAt: string }
  | { ok: false; error: string };

const PLAN_IDS: PlanId[] = ["organizador", "premium"];
const PAYMENT_METHODS = ["transferencia", "efectivo", "otro"];

/**
 * Registra un pago manual y extiende la vigencia. Misma semántica que el
 * canje de códigos (0032): premium extiende plan y rol; organizador extiende
 * el rol y nunca degrada un premium vigente.
 */
export async function extendUserPlan(input: {
  userId: string;
  plan: string;
  days: number;
  amount: number;
  method: string;
  note?: string;
}): Promise<PlanExtendResult> {
  const adminUser = await requireSuperadminSession();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  if (!UUID_RE.test(input.userId)) {
    return { ok: false, error: "Usuario inválido" };
  }

  const plan = PLAN_IDS.includes(input.plan as PlanId)
    ? (input.plan as PlanId)
    : null;
  if (!plan) return { ok: false, error: "Plan inválido" };

  const days = Math.floor(Number(input.days));
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    return { ok: false, error: "Los días deben estar entre 1 y 365." };
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) {
    return { ok: false, error: "Monto inválido." };
  }

  const method = input.method;
  if (!PAYMENT_METHODS.includes(method)) {
    return { ok: false, error: "Medio de pago inválido." };
  }

  const note = String(input.note ?? "").trim().slice(0, 300) || null;

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select(
      "id, email, role, plan, plan_expires_at, role_expires_at",
    )
    .eq("id", input.userId)
    .maybeSingle();

  if (targetError) return { ok: false, error: targetError.message };
  if (!target) return { ok: false, error: "Usuario no encontrado." };
  if (target.role === "superadmin") {
    return { ok: false, error: "No se extiende el plan de un superadmin." };
  }

  const now = new Date();
  const baseRole = target.role_expires_at
    ? new Date(target.role_expires_at)
    : now;
  const basePlan = target.plan_expires_at
    ? new Date(target.plan_expires_at)
    : now;
  const fromRole = baseRole > now ? baseRole : now;
  const fromPlan = basePlan > now ? basePlan : now;

  const nextRoleExpiry = new Date(
    fromRole.getTime() + days * 24 * 60 * 60 * 1000,
  );

  const currentPlan = target.plan as string | null;
  const nextPlan =
    plan === "premium" || currentPlan === "premium" ? "premium" : "organizador";

  // Organizador nunca degrada un premium vigente (igual que el canje).
  const nextPlanExpiry =
    plan === "premium"
      ? new Date(fromPlan.getTime() + days * 24 * 60 * 60 * 1000)
      : target.plan_expires_at
        ? new Date(target.plan_expires_at)
        : null;

  const expiresAt = plan === "premium" ? nextPlanExpiry : nextRoleExpiry;

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      role: target.role === "user" ? "admin" : target.role,
      plan: nextPlan,
      plan_expires_at: nextPlanExpiry ? nextPlanExpiry.toISOString() : null,
      role_expires_at: nextRoleExpiry.toISOString(),
    })
    .eq("id", target.id);

  if (updateError) return { ok: false, error: updateError.message };

  const { error: orderError } = await admin.from("plan_orders").insert({
    user_id: target.id,
    plan,
    amount_ars: amount,
    days,
    method,
    note,
    status: "paid",
    created_by: adminUser.id,
    paid_at: now.toISOString(),
    expires_at: expiresAt ? expiresAt.toISOString() : null,
  });

  if (orderError) {
    return {
      ok: false,
      error: `Plan extendido, pero no se pudo guardar el pago: ${orderError.message}`,
    };
  }

  await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "PLAN_PAYMENT",
    targetUserId: target.id,
    targetEmail: target.email,
    details: {
      plan,
      days,
      amount,
      method,
      note,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
    },
  });

  revalidateAdminViews();
  revalidatePath(`/admin/super/usuarios/${target.id}`);
  revalidatePath("/planes");
  revalidatePath("/perfil");

  return {
    ok: true,
    expiresAt: expiresAt
      ? expiresAt.toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "sin vencimiento",
  };
}
