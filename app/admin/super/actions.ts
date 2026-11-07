"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSuperadminSession } from "@/lib/auth";
import { canFeature } from "@/lib/featured";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canImpersonateTarget } from "@/lib/impersonation";
import {
  clearImpersonationOrigin,
  readImpersonationOrigin,
  setImpersonationOrigin,
} from "@/lib/impersonation-server";
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
  phone: string | null;
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

/**
 * Escribe una fila de auditoría. Devuelve `false` solo si no se pudo registrar
 * tras reintentar: las acciones sensibles (impersonación) usan ese resultado
 * para fallar cerrado en lugar de dejar una acción sin rastro.
 *
 * Dos intentos: la auditoría no puede perderse por un error transitorio.
 * Si aun así falla, no hay transacción que abarque la acción + el log en las
 * Server Actions, así que el llamador decide (ver `startImpersonation`).
 */
async function logAction(params: {
  adminId: string;
  adminEmail: string | null;
  action: string;
  targetUserId: string | null;
  targetEmail: string | null;
  details: Record<string, unknown>;
}): Promise<boolean> {
  const admin = createAdminClient();
  const payload = {
    admin_id: params.adminId,
    admin_email: params.adminEmail,
    action: params.action,
    target_user_id: params.targetUserId,
    target_email: params.targetEmail,
    details: JSON.stringify(params.details),
  };

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { error } = await admin.from("admin_audit_logs").insert(payload);
    if (!error) return true;

    console.error("[logAction] no se pudo registrar la auditoría:", error.message, {
      action: params.action,
      targetUserId: params.targetUserId,
      attempt,
    });
  }

  return false;
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
      "id, full_name, email, role, created_at, admin_request_status, is_banned, phone",
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
export async function deleteUsers(
  userIds: string[],
  options: { force?: boolean; reason?: string } = {},
): Promise<ActionResult> {
  const adminUser = await requireSuperadminSession();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  const loaded = await loadTargets(adminUser.id, userIds);
  if (!loaded.ok) return loaded;

  const admin = createAdminClient();

  // Mismas validaciones que la baja desde el perfil (spec baja-de-cuenta).
  const bloqueadas: string[] = [];
  for (const t of loaded.targets) {
    const { data: motivos } = await admin.rpc("account_deletion_blockers", {
      p_user: t.id,
    });
    const lista = (motivos ?? []) as string[];
    if (lista.length > 0) {
      bloqueadas.push(`${t.email ?? t.id}: ${lista.join(", ")}`);
    }
  }

  const motivoForzado = (options.reason ?? "").trim();

  if (bloqueadas.length > 0 && !options.force) {
    return {
      ok: false,
      error: `No se puede borrar: hay cuentas con actividad (${bloqueadas.join(" | ")}). Resolvé esos pendientes o forzá el borrado con un motivo.`,
    };
  }

  if (bloqueadas.length > 0 && options.force && motivoForzado.length < 10) {
    return {
      ok: false,
      error:
        "Para forzar el borrado escribí un motivo de al menos 10 caracteres. Queda en la auditoría.",
    };
  }
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
        forced: Boolean(options.force) && bloqueadas.length > 0,
        forceReason: motivoForzado || null,
        blockers: bloqueadas,
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

export type PlanId = "organizador" | "pro" | "premium" | "social";

export type PlanExtendResult =
  | { ok: true; expiresAt: string }
  | { ok: false; error: string };

const PLAN_IDS: PlanId[] = ["organizador", "pro", "premium", "social"];
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

// =====================================================================
// Modo editor: impersonación segura de un usuario (solo superadmin)
// =====================================================================
//
// Flujo:
//   1. `startImpersonation` guarda el refresh token del admin en una cookie
//      httpOnly y cambia la sesión del navegador por la del usuario destino.
//   2. `stopImpersonation` usa ese refresh token para recuperar la sesión del
//      superadmin y verifica que siga siéndolo.
//
// Garantías:
//   * El rol se lee SIEMPRE de `profiles` en el servidor (requireSuperadminSession).
//   * Nunca se permite impersonar a sí mismo, a otro superadmin, a una cuenta
//     suspendida ni a un usuario sin email.
//   * El refresh token del admin vive SOLO en la cookie httpOnly: no viaja al
//     cliente ni en las respuestas.
//   * Toda impersonación efectiva queda en `admin_audit_logs` (IMPERSONATE_USER)
//     y toda salida (IMPERSONATE_END), con el admin real como autor.

export type ImpersonationStartResult =
  | { ok: true; targetName: string }
  | { ok: false; error: string };

export type ImpersonationStopResult =
  | { ok: true }
  | { ok: false; error: string };

export type ProfileEditResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

interface ImpersonationTargetRow {
  id: string;
  email: string | null;
  role: string;
  is_banned: boolean | null;
  full_name: string | null;
}

interface ProfileTargetRow {
  id: string;
  email: string | null;
  role: string;
  full_name: string | null;
  phone: string | null;
}

/**
 * Traduce los errores crudos de Supabase Auth (generateLink / verifyOtp) a
 * mensajes accionables en español. Nunca se devuelve el mensaje original:
 * puede nombrar detalles internos del proyecto.
 */
function friendlyImpersonationAuthError(message: string): string {
  const m = (message ?? "").toLowerCase();

  if (
    m.includes("not confirmed") ||
    m.includes("email_not_confirmed") ||
    m.includes("confirm your email")
  ) {
    return "Ese usuario todavía no confirmó su email: pedile que lo confirme antes de usar el modo editor.";
  }
  if (m.includes("banned") || m.includes("suspended")) {
    return "La cuenta está suspendida: no se puede usar el modo editor.";
  }
  if (m.includes("not found") || m.includes("user_not_found")) {
    return "Ese usuario no existe en Auth: revisá su cuenta.";
  }
  if (
    m.includes("expired") ||
    m.includes("invalid") ||
    m.includes("otp") ||
    m.includes("token")
  ) {
    return "El enlace de acceso del usuario expiró o no es válido. Probá de nuevo.";
  }
  return "No se pudo iniciar sesión como el usuario. Probá de nuevo.";
}

/** Cierra la sesión actual sin que un fallo de red impida seguir con la salida. */
async function signOutQuietly(
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  try {
    // `local`: limpia las cookies de esta sesión sin depender de la red.
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // La cookie de restauración se borra igual en el llamador.
  }
}

/**
 * Entra en "modo editor" como el usuario indicado. Solo superadmin.
 *
 * Pasos: validar actor y destino → guardar el origen (refresh token del admin)
 * en cookie httpOnly → generar un magic link server-side y canjearlo con el
 * cliente SSR para que las cookies de sesión del destino se escriban →
 * auditar → responder. Ante cualquier fallo se borra la cookie de restauración
 * para no dejar al navegador en un estado a medias.
 */
export async function startImpersonation(
  userId: string,
  motivo?: string,
): Promise<ImpersonationStartResult> {
  const adminUser = await requireSuperadminSession();
  if (!adminUser) return { ok: false, error: "No autorizado" };
  if (!UUID_RE.test(userId)) return { ok: false, error: "Usuario inválido" };

  // Motivo opcional: queda en la auditoría para saber por qué se entró.
  const motivoLimpio = String(motivo ?? "").trim().slice(0, 200);

  const admin = createAdminClient();
  const { data: targetData, error: targetError } = await admin
    .from("profiles")
    .select("id, email, role, is_banned, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (targetError) {
    console.error(
      "[startImpersonation] no se pudo cargar el usuario:",
      targetError.message,
    );
    return { ok: false, error: "No se pudo cargar el usuario. Probá de nuevo." };
  }
  if (!targetData) return { ok: false, error: "Usuario no encontrado" };

  const target = targetData as ImpersonationTargetRow;
  const targetEmail = (target.email ?? "").trim();
  const allowed = canImpersonateTarget(
    {
      id: target.id,
      role: target.role,
      is_banned: target.is_banned,
      email: targetEmail,
    },
    adminUser.id,
  );
  if (!allowed.ok) return allowed;

  const targetName = (target.full_name ?? "").trim() || targetEmail;

  const supabase = createClient();

  // Sesión REAL del admin (la del navegador, no la que se va a crear).
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (
    !session?.refresh_token ||
    !session.user ||
    session.user.id !== adminUser.id
  ) {
    return {
      ok: false,
      error:
        "No se pudo leer tu sesión de superadmin. Volvé a iniciar sesión y probá de nuevo.",
    };
  }

  // El refresh token del admin queda SOLO en esta cookie httpOnly.
  await setImpersonationOrigin({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    adminRefreshToken: session.refresh_token,
    targetId: target.id,
    targetName,
    startedAt: new Date().toISOString(),
  });

  try {
    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email: targetEmail,
      });

    if (linkError) {
      await clearImpersonationOrigin();
      return {
        ok: false,
        error: friendlyImpersonationAuthError(linkError.message),
      };
    }

    const tokenHash = linkData?.properties?.hashed_token;
    if (!tokenHash) {
      await clearImpersonationOrigin();
      return {
        ok: false,
        error: "No se pudo generar el acceso al usuario. Probá de nuevo.",
      };
    }

    // Canjea el token con el MISMO cliente SSR: así las cookies de sesión del
    // usuario destino se escriben en este navegador (Server Action).
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });

    if (verifyError) {
      await clearImpersonationOrigin();
      return {
        ok: false,
        error: friendlyImpersonationAuthError(verifyError.message),
      };
    }
  } catch (error) {
    await clearImpersonationOrigin();
    console.error(
      "[startImpersonation] fallo inesperado al cambiar de sesión:",
      error instanceof Error ? error.message : error,
    );
    return {
      ok: false,
      error: "No se pudo iniciar el modo editor. Probá de nuevo.",
    };
  }

  // Recién acá la impersonación es efectiva: es lo que se audita. Si la
  // auditoría no se puede escribir, se deshace la sesión del destino: nunca
  // queda una impersonación efectiva sin rastro.
  const audited = await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "IMPERSONATE_USER",
    targetUserId: target.id,
    targetEmail,
    details: {
      target_email: targetEmail,
      target_role: target.role,
      motivo: motivoLimpio || null,
    },
  });

  if (!audited) {
    await signOutQuietly(supabase);
    await clearImpersonationOrigin();
    revalidatePath("/", "layout");
    return {
      ok: false,
      error:
        "El modo editor se canceló porque no se pudo registrar la auditoría. Probá de nuevo.",
    };
  }

  return { ok: true, targetName };
}

/**
 * Sale del "modo editor": restaura la sesión del superadmin con el refresh
 * token guardado al entrar y verifica en `profiles` que siga siendo superadmin.
 */
export async function stopImpersonation(): Promise<ImpersonationStopResult> {
  const origin = await readImpersonationOrigin();
  if (!origin) {
    return { ok: false, error: "No estás en modo editor." };
  }

  // Email del destino para el registro de auditoría (si la cuenta todavía
  // existe). Un fallo acá no impide salir: la salida se audita igual.
  let targetEmail: string | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("email")
      .eq("id", origin.targetId)
      .maybeSingle();
    targetEmail = (data as { email: string | null } | null)?.email ?? null;
  } catch {
    targetEmail = null;
  }

  // La salida se audita ANTES de tocar la sesión: si el registro no se puede
  // escribir, no se cambia nada (el admin sigue en modo editor y puede
  // reintentar). Así no existe una salida sin auditoría. Si después falla la
  // restauración, la impersonación igual termina (signOut), así que la fila
  // sigue siendo exacta.
  const audited = await logAction({
    adminId: origin.adminId,
    adminEmail: origin.adminEmail,
    action: "IMPERSONATE_END",
    targetUserId: origin.targetId,
    targetEmail,
    details: {
      target_name: origin.targetName,
      started_at: origin.startedAt,
      ended_at: new Date().toISOString(),
    },
  });

  if (!audited) {
    return {
      ok: false,
      error: "No se pudo registrar la salida en la auditoría. Probá de nuevo.",
    };
  }

  const supabase = createClient();
  const { data: refreshed, error: refreshError } =
    await supabase.auth.refreshSession({
      refresh_token: origin.adminRefreshToken,
    });

  if (
    refreshError ||
    !refreshed.session ||
    !refreshed.user ||
    refreshed.user.id !== origin.adminId
  ) {
    await signOutQuietly(supabase);
    await clearImpersonationOrigin();
    return {
      ok: false,
      error: "La sesión de superadmin venció; volvé a iniciar sesión.",
    };
  }

  // Fail closed: si no se puede confirmar el rol, no se restaura nada.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", refreshed.user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "superadmin") {
    await signOutQuietly(supabase);
    await clearImpersonationOrigin();
    return {
      ok: false,
      error: "La sesión de superadmin ya no es válida; volvé a iniciar sesión.",
    };
  }

  await clearImpersonationOrigin();
  revalidatePath("/", "layout");
  revalidatePath("/admin/super");

  return { ok: true };
}

// =====================================================================
// Soporte: edición manual del perfil (nombre y teléfono) con auditoría
// =====================================================================

/**
 * Edita el nombre y el teléfono de un perfil desde el panel de soporte.
 *
 * Límites deliberados: nunca toca email, rol, plan ni fechas; sólo esos dos
 * campos. La edición queda auditada siempre (con el antes y el después), incluso
 * si los valores no cambian.
 */
export async function updateUserProfile(input: {
  userId: string;
  fullName: string;
  phone: string;
}): Promise<ProfileEditResult> {
  const adminUser = await requireSuperadminSession();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  const userId = String(input?.userId ?? "").trim();
  if (!UUID_RE.test(userId)) return { ok: false, error: "Usuario inválido" };

  const fullName = String(input?.fullName ?? "").trim();
  if (fullName.length < 2 || fullName.length > 120) {
    return {
      ok: false,
      error: "El nombre debe tener entre 2 y 120 caracteres.",
    };
  }

  const rawPhone = String(input?.phone ?? "").trim();
  if (rawPhone.length > 30) {
    return {
      ok: false,
      error: "El teléfono no puede superar los 30 caracteres.",
    };
  }
  // Vacío = sin teléfono.
  const phone = rawPhone.length > 0 ? rawPhone : null;

  const admin = createAdminClient();
  const { data: targetData, error: targetError } = await admin
    .from("profiles")
    .select("id, email, role, full_name, phone")
    .eq("id", userId)
    .maybeSingle();

  if (targetError) {
    console.error(
      "[updateUserProfile] no se pudo cargar el perfil:",
      targetError.message,
    );
    return { ok: false, error: "No se pudo cargar el usuario. Probá de nuevo." };
  }
  if (!targetData) return { ok: false, error: "Usuario no encontrado." };

  const target = targetData as ProfileTargetRow;
  if (target.role === "superadmin" || target.id === adminUser.id) {
    return {
      ok: false,
      error: "No se puede editar el perfil de un superadmin.",
    };
  }

  const before = {
    full_name: target.full_name ?? null,
    phone: target.phone ?? null,
  };

  // Sólo estas dos columnas: email, rol y plan quedan fuera del update.
  const { data: updated, error: updateError } = await admin
    .from("profiles")
    .update({ full_name: fullName, phone })
    .eq("id", userId)
    .neq("role", "superadmin")
    .select("id");

  if (updateError) {
    console.error(
      "[updateUserProfile] no se pudo guardar el perfil:",
      updateError.message,
    );
    return {
      ok: false,
      error: "No se pudo guardar el perfil. Probá de nuevo.",
    };
  }
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error:
        "No se aplicó el cambio: el usuario ya no admite modificaciones.",
    };
  }

  await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "EDIT_PROFILE",
    targetUserId: userId,
    targetEmail: target.email ?? null,
    details: {
      before,
      after: { full_name: fullName, phone },
    },
  });

  revalidatePath("/admin/super");
  revalidatePath(`/admin/super/usuarios/${userId}`);

  return { ok: true, message: "Perfil actualizado." };
}

// =====================================================================
// Moderación de denuncias de sorteos (raffle_reports, 0064)
// =====================================================================
//
// El alta la hace el usuario con su cliente (RLS: reporter_id = auth.uid()).
// Acá la moderación corre con service role y SIEMPRE deja rastro en
// `admin_audit_logs` con las acciones REPORT_RESOLVE, REPORT_RAFFLE_PAUSE y
// REPORT_DELETE.
//
// Pausar un sorteo significa CERRAR SU VENTA (`raffles.status = 'closed'`), que
// es la transición que ya existe en el dominio. No se tocan pagos, reservas,
// números vendidos ni el motor de sorteo: el sorteo cerrado se puede sortear
// como cualquier otro y las devoluciones siguen siendo manuales.

export type ReportActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

/** Fila de `raffle_reports` que necesita la moderación. */
interface ReportAuditRow {
  id: string;
  raffle_id: string;
  reporter_id: string;
  reason: string;
  comment: string | null;
  status: string;
  created_at: string;
}

/** Dueño de un sorteo, para `target_user_id` de la auditoría. */
async function loadRaffleOwnerId(raffleId: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("raffles")
      .select("created_by")
      .eq("id", raffleId)
      .maybeSingle();

    if (error) {
      console.error(
        "[loadRaffleOwnerId] no se pudo leer el sorteo:",
        error.message,
      );
      return null;
    }

    return (
      (data as { created_by: string | null } | null)?.created_by ?? null
    );
  } catch (error) {
    console.error("[loadRaffleOwnerId] error:", error);
    return null;
  }
}

/** Email del dueño para completar la auditoría (si se puede leer). */
async function loadUserEmail(userId: string | null): Promise<string | null> {
  if (!userId) return null;

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    return (data as { email: string | null } | null)?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Marca una denuncia como resuelta o descartada. Solo superadmin.
 *
 * Se audita el estado NUEVO (el efectivo) junto con el reporte, el sorteo y el
 * denunciante; el destino de la auditoría es el dueño del sorteo, que es la
 * persona afectada por la denuncia.
 */
export async function resolveReport(
  reportId: string,
  status: "resolved" | "dismissed",
): Promise<ReportActionResult> {
  const adminUser = await requireSuperadminSession();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  if (!UUID_RE.test(reportId)) {
    return { ok: false, error: "Denuncia inválida" };
  }
  if (status !== "resolved" && status !== "dismissed") {
    return { ok: false, error: "Estado inválido" };
  }

  const admin = createAdminClient();
  const { data: reportData, error: findError } = await admin
    .from("raffle_reports")
    .select("id, raffle_id, reporter_id, reason, comment, status, created_at")
    .eq("id", reportId)
    .maybeSingle();

  if (findError) return { ok: false, error: findError.message };
  if (!reportData) return { ok: false, error: "La denuncia no existe." };

  const report = reportData as ReportAuditRow;

  const { data: updated, error: updateError } = await admin
    .from("raffle_reports")
    .update({
      status,
      resolved_at: new Date().toISOString(),
      resolved_by: adminUser.id,
    })
    .eq("id", reportId)
    .select("id");

  if (updateError) return { ok: false, error: updateError.message };
  if (!updated || updated.length === 0) {
    return { ok: false, error: "No se pudo actualizar la denuncia." };
  }

  const targetUserId = await loadRaffleOwnerId(report.raffle_id);
  const targetEmail = await loadUserEmail(targetUserId);

  const audited = await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "REPORT_RESOLVE",
    targetUserId,
    targetEmail,
    details: {
      report_id: reportId,
      raffle_id: report.raffle_id,
      reporter_id: report.reporter_id,
      status,
    },
  });

  revalidatePath("/admin/super");

  const done = status === "resolved" ? "Denuncia resuelta." : "Denuncia descartada.";
  return {
    ok: true,
    message: audited
      ? done
      : `${done} Ojo: no se pudo registrar la auditoría; avisá a un desarrollador.`,
  };
}

/**
 * Pausa el sorteo denunciado cerrando su venta (`active` → `closed`).
 *
 * El UPDATE lleva la guarda `.eq("status", "active")`: si el organizador ya lo
 * cerró, sorteó o canceló entre la lectura y la escritura, no se pisa ese
 * estado y se responde que el sorteo ya no está activo. No toca pagos, reservas
 * ni el motor de sorteo.
 */
export async function pauseReportedRaffle(
  reportId: string,
): Promise<ReportActionResult> {
  const adminUser = await requireSuperadminSession();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  if (!UUID_RE.test(reportId)) {
    return { ok: false, error: "Denuncia inválida" };
  }

  const admin = createAdminClient();
  const { data: reportData, error: findError } = await admin
    .from("raffle_reports")
    .select("id, raffle_id, reporter_id")
    .eq("id", reportId)
    .maybeSingle();

  if (findError) return { ok: false, error: findError.message };
  if (!reportData) return { ok: false, error: "La denuncia no existe." };

  const report = reportData as ReportAuditRow;

  const { data: raffleData, error: raffleError } = await admin
    .from("raffles")
    .select("id, status, created_by")
    .eq("id", report.raffle_id)
    .maybeSingle();

  if (raffleError) return { ok: false, error: raffleError.message };
  if (!raffleData) return { ok: false, error: "El sorteo no existe." };

  const raffle = raffleData as {
    id: string;
    status: string;
    created_by: string | null;
  };

  if (raffle.status !== "active") {
    return { ok: false, error: "El sorteo ya no está activo." };
  }

  const { data: updated, error: updateError } = await admin
    .from("raffles")
    // Cerrar la venta no alcanza: la home lista todos los sorteos sin mirar el
    // estado, así que el denunciado seguía en cartelera. Deslistarlo (0079) lo
    // saca del listado y de los buscadores, y lo deja accesible por enlace para
    // que el superadmin y el denunciante puedan revisarlo.
    .update({ status: "closed", is_listed: false })
    .eq("id", raffle.id)
    .eq("status", "active")
    .select("id");

  if (updateError) return { ok: false, error: updateError.message };
  if (!updated || updated.length === 0) {
    return { ok: false, error: "El sorteo ya no está activo." };
  }

  const targetUserId = raffle.created_by;
  const targetEmail = await loadUserEmail(targetUserId);

  const audited = await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "REPORT_RAFFLE_PAUSE",
    targetUserId,
    targetEmail,
    details: {
      report_id: reportId,
      raffle_id: raffle.id,
      from: "active",
      to: "closed",
      unlisted: true,
    },
  });

  revalidatePath(`/sorteos/${raffle.id}`);
  revalidatePath("/admin/super");

  return {
    ok: true,
    message: audited
      ? "Sorteo pausado (cerrado)."
      : "Sorteo pausado (cerrado), pero no se pudo registrar la auditoría; avisá a un desarrollador.",
  };
}

/**
 * Elimina una denuncia (no el sorteo). Solo superadmin.
 *
 * Se carga la fila ANTES del DELETE para poder auditar el snapshot completo:
 * después de borrarla ya no hay de dónde sacar raffle_id, reporter ni motivo.
 */
export async function deleteReport(
  reportId: string,
): Promise<ReportActionResult> {
  const adminUser = await requireSuperadminSession();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  if (!UUID_RE.test(reportId)) {
    return { ok: false, error: "Denuncia inválida" };
  }

  const admin = createAdminClient();
  const { data: reportData, error: findError } = await admin
    .from("raffle_reports")
    .select("id, raffle_id, reporter_id, reason, comment, status, created_at")
    .eq("id", reportId)
    .maybeSingle();

  if (findError) return { ok: false, error: findError.message };
  if (!reportData) return { ok: false, error: "La denuncia no existe." };

  const report = reportData as ReportAuditRow;

  const { data: deleted, error: deleteError } = await admin
    .from("raffle_reports")
    .delete()
    .eq("id", reportId)
    .select("id");

  if (deleteError) return { ok: false, error: deleteError.message };
  if (!deleted || deleted.length === 0) {
    return { ok: false, error: "No se pudo eliminar la denuncia." };
  }

  const targetUserId = await loadRaffleOwnerId(report.raffle_id);
  const targetEmail = await loadUserEmail(targetUserId);

  const audited = await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: "REPORT_DELETE",
    targetUserId,
    targetEmail,
    details: {
      report_id: reportId,
      raffle_id: report.raffle_id,
      reporter_id: report.reporter_id,
      reason: report.reason,
      status: report.status,
    },
  });

  revalidatePath("/admin/super");

  return {
    ok: true,
    message: audited
      ? "Denuncia eliminada."
      : "Denuncia eliminada, pero no se pudo registrar la auditoría; avisá a un desarrollador.",
  };
}

/**
 * Destaca un sorteo en la home y en la sección «más sorteos» de las landings,
 * o lo saca de destacados (migración 0066). Solo superadmin.
 *
 * Regla: **un solo destacado a la vez** y solo sobre sorteos activos. Al
 * marcar uno, el anterior se desmarca en la misma acción.
 *
 * La lectura de `is_featured` es pública; la escritura va por service role y
 * queda auditada. Si la migración todavía no se aplicó, el error es explícito
 * en vez de un mensaje de PostgREST.
 */
export async function setRaffleFeatured(
  raffleId: string,
  featured: boolean,
): Promise<ActionResult> {
  const adminUser = await requireSuperadminSession();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  if (!UUID_RE.test(raffleId)) return { ok: false, error: "Sorteo inválido" };

  const admin = createAdminClient();

  const { data: raffleData, error: findError } = await admin
    .from("raffles")
    .select("id, title, created_by, status")
    .eq("id", raffleId)
    .maybeSingle();

  if (findError) return { ok: false, error: findError.message };
  if (!raffleData) return { ok: false, error: "El sorteo no existe." };

  const raffle = raffleData as {
    id: string;
    title: string | null;
    created_by: string | null;
    status: string;
  };

  if (featured && !canFeature(raffle.status)) {
    return {
      ok: false,
      error: "Solo un sorteo activo puede destacarse.",
    };
  }

  // Un solo destacado a la vez: el anterior se desmarca antes de marcar este.
  if (featured) {
    const { error: clearError } = await admin
      .from("raffles")
      .update({ is_featured: false, featured_at: null })
      .eq("is_featured", true)
      .neq("id", raffle.id);

    if (clearError) return { ok: false, error: clearError.message };
  }

  const { data: updated, error: updateError } = await admin
    .from("raffles")
    .update({
      is_featured: featured,
      featured_at: featured ? new Date().toISOString() : null,
    })
    .eq("id", raffle.id)
    .select("id");

  if (updateError) {
    if (updateError.message.includes("is_featured")) {
      return {
        ok: false,
        error:
          "Falta aplicar la migración 0066 (sorteos destacados). Pegala en el SQL Editor y reintentá.",
      };
    }
    return { ok: false, error: updateError.message };
  }

  if (!updated || updated.length === 0) {
    return { ok: false, error: "El sorteo no existe." };
  }

  const targetEmail = await loadUserEmail(raffle.created_by);

  const audited = await logAction({
    adminId: adminUser.id,
    adminEmail: adminUser.email,
    action: featured ? "RAFFLE_FEATURE" : "RAFFLE_UNFEATURE",
    targetUserId: raffle.created_by,
    targetEmail,
    details: {
      raffle_id: raffle.id,
      title: raffle.title,
      featured,
      mode: "single",
    },
  });

  revalidatePath("/");
  revalidatePath("/admin/super");
  revalidatePath(`/sorteos/${raffle.id}`);
  revalidatePath(`/admin/sorteos/${raffle.id}`);

  return {
    ok: true,
    message: audited
      ? featured
        ? "Sorteo destacado. Se quitó el destacado anterior."
        : "Sorteo quitado de destacados."
      : "Cambio aplicado, pero no se pudo registrar la auditoría; avisá a un desarrollador.",
  };
}
