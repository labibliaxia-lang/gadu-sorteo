"use server";

import { revalidatePath } from "next/cache";

import { requireAdminSession } from "@/lib/auth";
import { sendRefundIssuedEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type VentaActionResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/**
 * Devuelve y libera números vendidos.
 *
 * No es un simple liberar: crea la devolución por lo efectivamente cobrado,
 * exige motivo y deja rastro en `raffle_audit` (migración 0091). La base rechaza
 * si el sorteo ya se sorteó o si el motivo es corto.
 */
export async function refundAndRelease(
  raffleId: string,
  numbers: number[],
  reason: string,
): Promise<VentaActionResult> {
  const actor = await requireAdminSession();
  if (!actor) return { ok: false, error: "No autorizado" };

  if (!Array.isArray(numbers) || numbers.length === 0) {
    return { ok: false, error: "No hay números para liberar." };
  }

  const supabase = createClient();

  // Antes de liberar: quiénes son los dueños de esos números. Después de la
  // RPC el `sold_to` queda en null y ya no hay a quién avisar.
  const { data: filas } = await supabase
    .from("raffle_numbers")
    .select("number, sold_to")
    .eq("raffle_id", raffleId)
    .eq("status", "sold")
    .in("number", numbers);

  const porComprador = new Map<string, number[]>();
  for (const fila of filas ?? []) {
    if (!fila.sold_to) continue;
    const lista = porComprador.get(fila.sold_to) ?? [];
    lista.push(fila.number as number);
    porComprador.set(fila.sold_to, lista);
  }

  const { data, error } = await supabase.rpc("refund_and_release_numbers", {
    p_raffle_id: raffleId,
    p_numbers: numbers,
    p_reason: reason,
  });

  if (error) return { ok: false, error: error.message };

  // Aviso al comprador: es transaccional y sirve para reclamar si fue un error.
  // Best-effort: si el email falla, la devolución ya está hecha.
  try {
    const admin = createAdminClient();
    const { data: raffle } = await admin
      .from("raffles")
      .select("title")
      .eq("id", raffleId)
      .maybeSingle();

    for (const [comprador, numeros] of porComprador) {
      const { data: perfil } = await admin
        .from("profiles")
        .select("email, terms_accepted_at")
        .eq("id", comprador)
        .maybeSingle();

      if (!perfil?.email || !perfil.terms_accepted_at) continue;

      await sendRefundIssuedEmail({
        to: perfil.email as string,
        raffleTitle: raffle?.title ?? "tu sorteo",
        raffleId,
        numbers: numeros.sort((a, b) => a - b),
      });
    }
  } catch (error) {
    console.error("[email] devolución registrada:", error);
  }

  revalidatePath(`/admin/sorteos/${raffleId}/ventas`);
  revalidatePath(`/admin/sorteos/${raffleId}`);
  revalidatePath(`/sorteos/${raffleId}`);

  return { ok: true, count: Number(data ?? 0) };
}

/**
 * Registra un pago ya cobrado (transferencia, efectivo, alias) sobre números
 * vendidos a mano. Crea la fila en `payments` y la enlaza a los números.
 */
export async function registerPayment(
  raffleId: string,
  numbers: number[],
  amount: number,
): Promise<VentaActionResult> {
  const actor = await requireAdminSession();
  if (!actor) return { ok: false, error: "No autorizado" };

  if (!Array.isArray(numbers) || numbers.length === 0) {
    return { ok: false, error: "No hay números para registrar." };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "El importe tiene que ser mayor que cero." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("organizer_register_payment", {
    p_raffle_id: raffleId,
    p_numbers: numbers,
    p_amount: amount,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/sorteos/${raffleId}/ventas`);
  revalidatePath(`/admin/sorteos/${raffleId}`);
  revalidatePath(`/admin/sorteos/${raffleId}/numeros`);

  return { ok: true, count: numbers.length };
}
