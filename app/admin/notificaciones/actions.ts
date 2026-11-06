"use server";

import { revalidatePath } from "next/cache";

import { requireAdminSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  markNumbersSold,
  releaseNumbers,
} from "@/app/admin/sorteos/[id]/numeros/actions";

export type NotifActionResult = { ok: true } | { ok: false; error: string };

interface FilaNotificacion {
  id: string;
  type: string;
  raffle_id: string | null;
  payload: { numbers?: number[] } | null;
  status: string;
}

/** Lee la notificación con la sesión del organizador: RLS garantiza que sea suya. */
async function cargar(id: string): Promise<FilaNotificacion | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, raffle_id, payload, status")
    .eq("id", id)
    .maybeSingle();

  return (data as FilaNotificacion | null) ?? null;
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
