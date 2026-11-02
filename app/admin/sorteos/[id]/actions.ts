"use server";

import { revalidatePath } from "next/cache";

import { requireAdminSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Verifica que el sorteo pertenezca al admin autenticado actual. Es una
// segunda capa: las políticas RLS de 0030 ya acotan la escritura al dueño.
async function ownsRaffle(raffleId: string, userId: string): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase
    .from("raffles")
    .select("created_by")
    .eq("id", raffleId)
    .single();

  return data?.created_by === userId;
}

export async function deleteRaffle(raffleId: string) {
  const ctx = await requireAdminSession();
  if (!ctx) return { ok: false, error: "No autorizado" };
  if (!ctx.isSuper && !(await ownsRaffle(raffleId, ctx.id))) {
    return { ok: false, error: "No autorizado" };
  }

  const supabase = createClient();
  let query = supabase.from("raffles").delete().eq("id", raffleId);
  if (!ctx.isSuper) query = query.eq("created_by", ctx.id);

  const { error } = await query;

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/sorteos");
  return { ok: true };
}

export async function updateRaffle(
  raffleId: string,
  data: {
    title: string;
    description?: string | null;
    price_per_number: number;
    draw_date: string;
    cover_image_url?: string | null;
    payment_type?: "mercadopago" | "transferencia";
    transfer_alias?: string | null;
    transfer_cbu?: string | null;
    transfer_bank?: string | null;
    whatsapp_contact?: string | null;
  },
) {
  const ctx = await requireAdminSession();
  if (!ctx) return { ok: false, error: "No autorizado" };
  if (!ctx.isSuper && !(await ownsRaffle(raffleId, ctx.id))) {
    return { ok: false, error: "No autorizado" };
  }

  const supabase = createClient();
  let query = supabase
    .from("raffles")
    .update({
      title: data.title,
      description: data.description ?? null,
      price_per_number: data.price_per_number,
      draw_date: new Date(data.draw_date).toISOString(),
      cover_image_url: data.cover_image_url ?? null,
      payment_type: data.payment_type ?? "mercadopago",
      transfer_alias: data.transfer_alias ?? null,
      transfer_cbu: data.transfer_cbu ?? null,
      transfer_bank: data.transfer_bank ?? null,
      whatsapp_contact: data.whatsapp_contact ?? null,
    })
    .eq("id", raffleId);
  if (!ctx.isSuper) query = query.eq("created_by", ctx.id);

  const { error } = await query;

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${raffleId}`);
  return { ok: true };
}

export type MarkPaidResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/**
 * Marca como pagados números que el comprador dejó reservados en el flujo de
 * prepago manual (WhatsApp). El RPC exige ser dueño del sorteo o superadmin y
 * solo toca números reservados: si alguno ya no lo está, no marca ninguno.
 */
export async function markReservationPaid(
  raffleId: string,
  numbers: number[],
): Promise<MarkPaidResult> {
  const ctx = await requireAdminSession();
  if (!ctx) return { ok: false, error: "No autorizado" };

  const clean = Array.from(
    new Set(
      (Array.isArray(numbers) ? numbers : []).filter(
        (n) => Number.isInteger(n) && n >= 1 && n <= 10000,
      ),
    ),
  );

  if (clean.length === 0) {
    return { ok: false, error: "Elegí al menos un número reservado." };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("organizer_mark_reserved_sold", {
    p_raffle_id: raffleId,
    p_numbers: clean,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/sorteos");
  revalidatePath(`/admin/sorteos/${raffleId}`);
  revalidatePath(`/admin/sorteos/${raffleId}/numeros`);
  revalidatePath(`/sorteos/${raffleId}`);

  return { ok: true, count: Number(data ?? 0) };
}

export async function cloneRaffle(raffleId: string) {
  const ctx = await requireAdminSession();
  if (!ctx) return { ok: false, error: "No autorizado" };
  if (!ctx.isSuper && !(await ownsRaffle(raffleId, ctx.id))) {
    return { ok: false, error: "No autorizado" };
  }

  const supabase = createClient();

  const { data: source } = await supabase
    .from("raffles")
    .select("*")
    .eq("id", raffleId)
    .single();

  if (!source) {
    return { ok: false, error: "Sorteo no encontrado" };
  }

  const { count: numberCount } = await supabase
    .from("raffle_numbers")
    .select("*", { count: "exact", head: true })
    .eq("raffle_id", raffleId);

  const { data: prizes } = await supabase
    .from("prizes")
    .select("*")
    .eq("raffle_id", raffleId);

  // Fecha futura (30 días) para el clon.
  const futureDate = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: cloned, error: insertError } = await supabase
    .from("raffles")
    .insert({
      title: `${source.title} (Copia)`,
      description: source.description,
      price_per_number: source.price_per_number,
      cover_image_url: source.cover_image_url,
      draw_date: futureDate,
      status: "active",
      created_by: ctx.id,
      payment_type: source.payment_type ?? "mercadopago",
      // Los datos de contacto/pago son personales del organizador: NO se
      // copian del sorteo origen para no heredar el número del dueño original.
      transfer_alias: null,
      transfer_cbu: null,
      transfer_bank: null,
      whatsapp_contact: null,
    })
    .select()
    .single();

  if (insertError || !cloned) {
    return {
      ok: false,
      error: insertError?.message ?? "No se pudo clonar el sorteo",
    };
  }

  // Duplicar premios (sin clonar números).
  if (prizes && prizes.length > 0) {
    const prizesToInsert = prizes.map((p) => ({
      raffle_id: cloned.id,
      position: p.position,
      title: p.title,
      description: p.description,
      image_url: p.image_url,
      image_url_2: p.image_url_2 ?? null,
      tool_number: p.tool_number,
    }));

    const { error: prizesError } = await supabase
      .from("prizes")
      .insert(prizesToInsert);

    if (prizesError) {
      // Rollback del clon.
      await supabase.from("raffles").delete().eq("id", cloned.id);
      return { ok: false, error: prizesError.message };
    }
  }

  // Genera un pool limpio con la misma cantidad que el original.
  if (numberCount && numberCount > 0) {
    const { error: numbersError } = await supabase.rpc(
      "create_raffle_numbers",
      { p_raffle_id: cloned.id, p_max_numbers: numberCount },
    );

    if (numbersError) {
      // Rollback del clon.
      await supabase.from("raffles").delete().eq("id", cloned.id);
      return { ok: false, error: numbersError.message };
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/sorteos");
  return { ok: true, raffleId: cloned.id };
}
