"use server";

import { revalidatePath } from "next/cache";

import { requireSuperadminSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type BajaActionResult = { ok: true } | { ok: false; error: string };

/**
 * Aprueba la baja: valida, purga los documentos KYC y elimina la cuenta.
 *
 * La solicitud referencia `profiles` con `on delete cascade`, así que el borrado
 * de la cuenta también borra la fila de la solicitud. La evidencia durable es la
 * fila de `admin_audit_logs`.
 */
export async function approveAccountDeletion(
  requestId: string,
): Promise<BajaActionResult> {
  const adminUser = await requireSuperadminSession();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  const admin = createAdminClient();

  const { data: request } = await admin
    .from("account_deletion_requests")
    .select("id, user_id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return { ok: false, error: "La solicitud no existe." };
  if (request.status !== "pending") {
    return { ok: false, error: "La solicitud ya fue resuelta." };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, dni_front_url, dni_back_url, face_url")
    .eq("id", request.user_id)
    .maybeSingle();

  // No confiamos en lo que mostró la pantalla: se vuelve a validar acá.
  const { data: bloqueos, error: errorBloqueos } = await admin.rpc(
    "account_deletion_blockers",
    { p_user: request.user_id },
  );

  if (errorBloqueos) {
    return { ok: false, error: "No se pudieron verificar los bloqueos." };
  }
  if (((bloqueos ?? []) as string[]).length > 0) {
    return {
      ok: false,
      error: `No se puede aprobar: ${((bloqueos ?? []) as string[]).join(", ")}`,
    };
  }

  const files = [
    profile?.dni_front_url,
    profile?.dni_back_url,
    profile?.face_url,
  ].filter((f): f is string => Boolean(f));

  if (files.length > 0) {
    const { error: storageError } = await admin.storage
      .from("organizer-kyc")
      .remove(files);
    if (storageError) {
      // Sin esto, borrar la cuenta dejaría los documentos sin forma de ubicarlos.
      return {
        ok: false,
        error: "No se pudieron borrar los documentos KYC. La cuenta no se eliminó.",
      };
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(
    request.user_id,
  );
  if (deleteError) {
    return {
      ok: false,
      error: `No se pudo eliminar la cuenta: ${deleteError.message}`,
    };
  }

  await admin.from("admin_audit_logs").insert({
    admin_id: adminUser.id,
    admin_email: adminUser.email,
    action: "DELETE_USER",
    target_user_id: null,
    target_email: profile?.email ?? null,
    details: JSON.stringify({
      requestId,
      deletedUserId: request.user_id,
      kycFiles: files.length,
      source: "account_deletion_request",
    }),
  });

  revalidatePath("/admin/super/bajas");
  return { ok: true };
}

/** Rechaza la baja dejando el motivo visible para el usuario. */
export async function rejectAccountDeletion(
  requestId: string,
  note: string,
): Promise<BajaActionResult> {
  const adminUser = await requireSuperadminSession();
  if (!adminUser) return { ok: false, error: "No autorizado" };

  const admin = createAdminClient();

  const { error } = await admin
    .from("account_deletion_requests")
    .update({
      status: "rejected",
      note: note.trim().slice(0, 500) || "Rechazada por el administrador.",
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminUser.id,
    })
    .eq("id", requestId)
    .eq("status", "pending");

  if (error) return { ok: false, error: "No se pudo rechazar la solicitud." };

  revalidatePath("/admin/super/bajas");
  return { ok: true };
}
