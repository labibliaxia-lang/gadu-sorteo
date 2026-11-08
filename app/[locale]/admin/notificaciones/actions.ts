"use server";

import { revalidatePath } from "next/cache";

import { requireAdminSession } from "@/lib/auth";
import { sendPaymentApprovedEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  markNumbersSold,
  releaseNumbers,
} from "@/app/[locale]/admin/sorteos/[id]/numeros/actions";

export type NotifActionResult = { ok: true } | { ok: false; error: string };

interface FilaNotificacion {
  id: string;
  type: string;
  raffle_id: string | null;
  subject_user_id: string | null;
  payload: { numbers?: number[] } | null;
  status: string;
}

/** Lee la notificación con la sesión del organizador: RLS garantiza que sea suya. */
async function cargar(id: string): Promise<FilaNotificacion | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, raffle_id, subject_user_id, payload, status")
    .eq("id", id)
    .maybeSingle();

  return (data as FilaNotificacion | null) ?? null;
}

/**
 * Avisa al jugador por la campana. Escribe con service role: no hay política de
 * INSERT para clientes.
 */
async function avisarComprador(
  noti: FilaNotificacion,
  type: string,
  title: string,
  message: string,
): Promise<void> {
  if (!noti.subject_user_id) return;

  try {
    const admin = createAdminClient();
    await admin.from("notifications").insert({
      user_id: noti.subject_user_id,
      type,
      title,
      message,
      audience: "buyer",
      raffle_id: noti.raffle_id,
      payload: { numbers: noti.payload?.numbers ?? [] },
    });
  } catch (error) {
    console.error("[notificaciones] no se pudo avisar al comprador:", error);
  }
}

/**
 * "Invitá y ganá" (0102): al aprobar una reserva manual se revisan los
 * referidos de ese comprador que todavía no cobraron. La función de la base
 * aplica las reglas del organizador (sorteo habilitado, mínimos y tope).
 */
async function premiarReferidos(raffleId: string, buyerId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: pendientes } = await admin
      .from("referrals")
      .select("id")
      .eq("referred_id", buyerId)
      .eq("rewarded", false);

    for (const fila of pendientes ?? []) {
      await admin.rpc("reward_referral", {
        p_referral_id: fila.id as string,
        p_raffle_id: raffleId,
      });
    }
  } catch (error) {
    console.error("[referidos] no se pudo premiar al referente:", error);
  }
}

/** Email de pago confirmado al comprador (best-effort, no bloquea nada). */async function emailAprobado(noti: FilaNotificacion): Promise<void> {
  if (!noti.subject_user_id || !noti.raffle_id) return;

  try {
    const admin = createAdminClient();
    const [{ data: perfil }, { data: sorteo }] = await Promise.all([
      admin
        .from("profiles")
        .select("email")
        .eq("id", noti.subject_user_id)
        .maybeSingle(),
      admin.from("raffles").select("title").eq("id", noti.raffle_id).maybeSingle(),
    ]);

    if (!perfil?.email) return;

    await sendPaymentApprovedEmail({
      to: perfil.email as string,
      raffleTitle: (sorteo?.title as string) ?? "tu sorteo",
      raffleId: noti.raffle_id,
      numbers: (noti.payload?.numbers ?? []).filter((n) => Number.isInteger(n)),
    });
  } catch (error) {
    console.error("[email] aprobación manual:", error);
  }
}

async function cerrarNotificacion(
  id: string,
  status: "read" | "resolved",
): Promise<NotifActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("notifications")
    .update({
      status,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
      read_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { ok: false, error: "No se pudo actualizar la notificación." };
  return { ok: true };
}

export async function markNotificationRead(id: string): Promise<NotifActionResult> {
  const actor = await requireAdminSession();
  if (!actor) return { ok: false, error: "No autorizado" };

  const result = await cerrarNotificacion(id, "read");
  revalidatePath("/admin/notificaciones");
  return result;
}

/**
 * Cierra un aviso informativo (pago acreditado, devolución confirmada, etc.)
 * sin tocar nada del sorteo. Es lo que permite que ninguna tarjeta quede sin
 * salida: siempre hay un "Listo".
 */
export async function dismissNotification(
  id: string,
): Promise<NotifActionResult> {
  const actor = await requireAdminSession();
  if (!actor) return { ok: false, error: "No autorizado" };

  const result = await cerrarNotificacion(id, "resolved");
  revalidatePath("/admin/notificaciones");
  return result;
}

/** Aprueba la reserva: los números pasan a vendidos y la tarjeta se resuelve. */
export async function approveReservation(id: string): Promise<NotifActionResult> {
  const actor = await requireAdminSession();
  if (!actor) return { ok: false, error: "No autorizado" };

  const noti = await cargar(id);
  if (!noti || noti.type !== "reservation_pending" || !noti.raffle_id) {
    return { ok: false, error: "La notificación no está pendiente o no es una reserva." };
  }

  const numbers = (noti.payload?.numbers ?? []).filter((n) => Number.isInteger(n));
  if (numbers.length === 0) {
    return { ok: false, error: "La notificación no tiene números." };
  }

  const res = await markNumbersSold(noti.raffle_id, numbers);
  if (!res.ok) return { ok: false, error: res.error ?? "No se pudo marcar vendido" };

  await avisarComprador(
    noti,
    "buyer_reservation_approved",
    "✅ Números aprobados",
    "Tus números están confirmados. ¡Ya estás participando!",
  );
  await emailAprobado(noti);

  if (noti.subject_user_id) {
    await premiarReferidos(noti.raffle_id, noti.subject_user_id);
  }

  await cerrarNotificacion(id, "resolved");
  revalidatePath("/admin/notificaciones");
  return { ok: true };
}

/** Libera la reserva: los números vuelven a estar disponibles. */
export async function releaseReservation(id: string): Promise<NotifActionResult> {
  const actor = await requireAdminSession();
  if (!actor) return { ok: false, error: "No autorizado" };

  const noti = await cargar(id);
  if (!noti || noti.type !== "reservation_pending" || !noti.raffle_id) {
    return { ok: false, error: "La notificación no está pendiente o no es una reserva." };
  }

  const numbers = (noti.payload?.numbers ?? []).filter((n) => Number.isInteger(n));
  if (numbers.length === 0) {
    return { ok: false, error: "La notificación no tiene números." };
  }

  const res = await releaseNumbers(noti.raffle_id, numbers);
  if (!res.ok) return { ok: false, error: res.error ?? "No se pudo liberar" };

  await avisarComprador(
    noti,
    "buyer_reservation_released",
    "⚠️ Reserva liberada",
    "Tu reserva fue liberada. Los números vuelven a estar disponibles.",
  );

  await cerrarNotificacion(id, "resolved");
  revalidatePath("/admin/notificaciones");
  return { ok: true };
}

/** Da más tiempo al comprador antes de que el cron libere la reserva. */
export async function extendReservation(
  id: string,
  minutes = 15,
): Promise<NotifActionResult> {
  const actor = await requireAdminSession();
  if (!actor) return { ok: false, error: "No autorizado" };

  const noti = await cargar(id);
  if (!noti || noti.type !== "reservation_pending" || !noti.raffle_id) {
    return { ok: false, error: "La notificación no está pendiente o no es una reserva." };
  }

  const numbers = (noti.payload?.numbers ?? []).filter((n) => Number.isInteger(n));
  if (numbers.length === 0) {
    return { ok: false, error: "La notificación no tiene números." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("extend_reservation", {
    p_raffle_id: noti.raffle_id,
    p_numbers: numbers,
    p_minutes: minutes,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/notificaciones");
  return { ok: true };
}
