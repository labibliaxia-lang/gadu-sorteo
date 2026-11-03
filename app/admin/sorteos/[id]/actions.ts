"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth";
import { sendPaymentApprovedEmail, sendWinnerEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid("Identificador inválido");

async function raffleTitle(raffleId: string): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase
    .from("raffles")
    .select("title")
    .eq("id", raffleId)
    .maybeSingle();

  return (data?.title as string | undefined) ?? "el sorteo";
}

/**
 * Avisos por email. Se disparan en segundo plano (no bloquean la operación) y
 * nunca lanzan: `sendEmail` ya absorbe los errores.
 */
async function notifyPaidBuyers(
  raffleId: string,
  numbers: number[],
  title: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: rows } = await admin
      .from("raffle_numbers")
      .select("sold_to")
      .eq("raffle_id", raffleId)
      .in("number", numbers)
      .eq("status", "sold");

    const buyerIds = Array.from(
      new Set(
        (rows ?? [])
          .map((row) => row.sold_to as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (buyerIds.length === 0) return;

    const { data: profiles } = await admin
      .from("profiles")
      .select("email, email_opt_in, terms_accepted_at")
      .in("id", buyerIds);

    for (const profile of profiles ?? []) {
      if (profile.email && profile.email_opt_in && profile.terms_accepted_at) {
        await sendPaymentApprovedEmail({
          to: profile.email as string,
          raffleTitle: title,
          raffleId,
          numbers,
        });
      }
    }
  } catch (error) {
    console.error("[email] pago aprobado:", error);
  }
}

async function notifyWinner(
  raffleId: string,
  winnerUserId: string | null,
  winnerNumber: number,
  title: string,
): Promise<void> {
  try {
    if (!winnerUserId) return;

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("email, email_opt_in, terms_accepted_at")
      .eq("id", winnerUserId)
      .maybeSingle();

    if (profile?.email && profile.email_opt_in && profile.terms_accepted_at) {
      await sendWinnerEmail({
        to: profile.email as string,
        raffleTitle: title,
        raffleId,
        winnerNumber,
      });
    }
  } catch (error) {
    console.error("[email] ganador:", error);
  }
}

/**
 * Pertenencia del sorteo, resuelta en la base con `owns_raffle()` (0030).
 * Incluye al superadmin y es la misma regla que usan las políticas RLS.
 */
async function ownsRaffle(raffleId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("owns_raffle", {
    p_raffle_id: raffleId,
  });

  return !error && data === true;
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Datos inválidos";
}

/** Resultado común de las acciones del panel. */
export type ActionResult = { ok: true } | { ok: false; error: string };

const raffleUpdateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "El título debe tener al menos 3 caracteres")
    .max(140, "El título no puede superar los 140 caracteres"),
  description: z
    .string()
    .max(2000, "La descripción es demasiado larga")
    .nullish(),
  price_per_number: z.coerce
    .number({ invalid_type_error: "Ingresá un precio válido" })
    .positive("El precio debe ser mayor a 0")
    .max(10_000_000, "Precio fuera de rango"),
  draw_date: z.coerce.date({ invalid_type_error: "Fecha inválida" }),
  cover_image_url: z
    .union([z.string().url("La portada no es una URL válida"), z.null()])
    .optional(),
  payment_type: z.enum(["mercadopago", "transferencia"]).optional(),
  transfer_alias: z.string().max(120).nullish(),
  transfer_cbu: z.string().max(40).nullish(),
  transfer_bank: z.string().max(120).nullish(),
  whatsapp_contact: z.string().max(40).nullish(),
});

export async function deleteRaffle(raffleId: string): Promise<ActionResult> {
  const ctx = await requireAdminSession();
  if (!ctx) return { ok: false, error: "No autorizado" };

  const id = uuidSchema.safeParse(raffleId);
  if (!id.success) return { ok: false, error: firstIssue(id.error) };

  if (!(await ownsRaffle(id.data))) {
    return { ok: false, error: "No autorizado" };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("raffles")
    .delete()
    .eq("id", id.data);

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
): Promise<ActionResult> {
  const ctx = await requireAdminSession();
  if (!ctx) return { ok: false, error: "No autorizado" };

  const id = uuidSchema.safeParse(raffleId);
  if (!id.success) return { ok: false, error: firstIssue(id.error) };

  const parsed = raffleUpdateSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  if (!(await ownsRaffle(id.data))) {
    return { ok: false, error: "No autorizado" };
  }

  const values = parsed.data;
  const supabase = createClient();
  const { error } = await supabase
    .from("raffles")
    .update({
      title: values.title,
      description: values.description ?? null,
      price_per_number: values.price_per_number,
      draw_date: values.draw_date.toISOString(),
      cover_image_url: values.cover_image_url ?? null,
      payment_type: values.payment_type ?? "mercadopago",
      transfer_alias: values.transfer_alias ?? null,
      transfer_cbu: values.transfer_cbu ?? null,
      transfer_bank: values.transfer_bank ?? null,
      whatsapp_contact: values.whatsapp_contact ?? null,
    })
    .eq("id", id.data);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${id.data}`);
  revalidatePath(`/sorteos/${id.data}`);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Premios: creación y edición desde el servidor
// ---------------------------------------------------------------------

const prizeInputSchema = z.object({
  id: uuidSchema.optional(),
  position: z.coerce
    .number({ invalid_type_error: "Posición inválida" })
    .int("La posición debe ser un número entero")
    .min(1, "La posición debe estar entre 1 y 10")
    .max(10, "La posición debe estar entre 1 y 10"),
  title: z
    .string()
    .trim()
    .min(2, "El título del premio es obligatorio")
    .max(140, "El título no puede superar los 140 caracteres"),
  description: z
    .string()
    .max(2000, "La descripción es demasiado larga")
    .nullish(),
  tool_number: z.coerce
    .number({ invalid_type_error: "Número de herramienta inválido" })
    .int("El número de herramienta debe ser entero")
    .min(1)
    .max(10000)
    .nullish(),
  image_url: z
    .union([z.string().url("La foto 1 no es una URL válida"), z.null()])
    .optional(),
  image_url_2: z
    .union([z.string().url("La foto 2 no es una URL válida"), z.null()])
    .optional(),
});

export type UpsertPrizeResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Crea o actualiza un premio del sorteo. El sorteo tiene que ser del
 * organizador (o del superadmin): lo valida `owns_raffle()` en la base.
 */
export async function upsertPrize(
  raffleId: string,
  input: unknown,
): Promise<UpsertPrizeResult> {
  const ctx = await requireAdminSession();
  if (!ctx) return { ok: false, error: "No autorizado" };

  const id = uuidSchema.safeParse(raffleId);
  if (!id.success) return { ok: false, error: firstIssue(id.error) };

  const parsed = prizeInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  if (!(await ownsRaffle(id.data))) {
    return { ok: false, error: "No autorizado" };
  }

  const values = parsed.data;
  const supabase = createClient();

  const base = {
    position: values.position,
    title: values.title,
    description: values.description ?? null,
    tool_number: values.tool_number ?? null,
    image_url: values.image_url ?? null,
    image_url_2: values.image_url_2 ?? null,
  };

  if (values.id) {
    const { data: updated, error } = await supabase
      .from("prizes")
      .update(base)
      .eq("id", values.id)
      .eq("raffle_id", id.data)
      .select("id")
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        error:
          error.code === "23505"
            ? "Ya existe un premio en esa posición."
            : error.message,
      };
    }
    if (!updated) {
      return { ok: false, error: "El premio no existe en este sorteo." };
    }

    revalidatePath(`/admin/sorteos/${id.data}/premios`);
    revalidatePath(`/sorteos/${id.data}`);
    return { ok: true, id: updated.id };
  }

  const { data: created, error } = await supabase
    .from("prizes")
    .insert({ raffle_id: id.data, ...base })
    .select("id")
    .single();

  if (error || !created) {
    return {
      ok: false,
      error:
        error?.code === "23505"
          ? "Ya existe un premio en esa posición."
          : (error?.message ?? "No se pudo guardar el premio."),
    };
  }

  revalidatePath(`/admin/sorteos/${id.data}/premios`);
  revalidatePath(`/sorteos/${id.data}`);
  return { ok: true, id: created.id };
}

export async function deletePrize(
  raffleId: string,
  prizeId: string,
): Promise<ActionResult> {
  const ctx = await requireAdminSession();
  if (!ctx) return { ok: false, error: "No autorizado" };

  const raffle = uuidSchema.safeParse(raffleId);
  if (!raffle.success) return { ok: false, error: firstIssue(raffle.error) };

  const prize = uuidSchema.safeParse(prizeId);
  if (!prize.success) return { ok: false, error: firstIssue(prize.error) };

  if (!(await ownsRaffle(raffle.data))) {
    return { ok: false, error: "No autorizado" };
  }

  const supabase = createClient();
  const { data: removed, error } = await supabase
    .from("prizes")
    .delete()
    .eq("id", prize.data)
    .eq("raffle_id", raffle.data)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!removed) return { ok: false, error: "El premio no existe en este sorteo." };

  revalidatePath(`/admin/sorteos/${raffle.data}/premios`);
  revalidatePath(`/sorteos/${raffle.data}`);
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
  note?: string,
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

  const cleanNote = String(note ?? "").trim().slice(0, 300) || null;

  const supabase = createClient();
  const { data, error } = await supabase.rpc("organizer_mark_reserved_sold", {
    p_raffle_id: raffleId,
    p_numbers: clean,
  });

  if (error) return { ok: false, error: error.message };

  // Nota interna del organizador (queda en la auditoría, no se muestra al
  // comprador). Es best-effort: no revierte la venta si falla.
  try {
    const admin = createAdminClient();
    await admin.from("admin_audit_logs").insert({
      admin_id: ctx.id,
      admin_email: ctx.email,
      action: "MARK_PAID",
      target_user_id: null,
      target_email: null,
      details: JSON.stringify({
        raffle_id: raffleId,
        numbers: clean,
        count: Number(data ?? 0),
        note: cleanNote,
      }),
    });
  } catch (auditError) {
    console.error("[markReservationPaid] auditoría:", auditError);
  }

  // Aviso por email al comprador. La venta ya está confirmada: el envío se
  // espera para que Vercel no congele la función antes de que salga.
  const title = await raffleTitle(raffleId);
  await notifyPaidBuyers(raffleId, clean, title);

  revalidatePath("/admin");
  revalidatePath("/admin/sorteos");
  revalidatePath(`/admin/sorteos/${raffleId}`);
  revalidatePath(`/admin/sorteos/${raffleId}/numeros`);
  revalidatePath(`/sorteos/${raffleId}`);

  return { ok: true, count: Number(data ?? 0) };
}

export type UndoPaidResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/**
 * Deshace un «Marcar como pagado» reciente (máx. 10 minutos) y devuelve los
 * números a reserva del mismo comprador. Usa service role porque RLS ya no
 * permite UPDATE directo de raffle_numbers (0041).
 */
export async function undoMarkReservationPaid(
  raffleId: string,
  numbers: number[],
): Promise<UndoPaidResult> {
  const ctx = await requireAdminSession();
  if (!ctx) return { ok: false, error: "No autorizado" };

  if (!(await ownsRaffle(raffleId))) {
    return { ok: false, error: "No autorizado" };
  }

  const clean = Array.from(
    new Set(
      (Array.isArray(numbers) ? numbers : []).filter(
        (n) => Number.isInteger(n) && n >= 1 && n <= 10000,
      ),
    ),
  );

  if (clean.length === 0) {
    return { ok: false, error: "No hay números para revertir." };
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("raffle_numbers")
    .select("number, sold_to, sold_at")
    .eq("raffle_id", raffleId)
    .in("number", clean)
    .eq("status", "sold");

  if (error) return { ok: false, error: error.message };

  const cutoff = Date.now() - 10 * 60 * 1000;
  const undoable = (rows ?? []).filter(
    (row) =>
      row.sold_to &&
      row.sold_at &&
      new Date(row.sold_at as string).getTime() >= cutoff,
  );

  if (undoable.length === 0) {
    return {
      ok: false,
      error:
        "Solo se puede deshacer dentro de los 10 minutos posteriores a marcar el pago.",
    };
  }

  const reservedUntil = new Date(
    Date.now() + 48 * 60 * 60 * 1000,
  ).toISOString();

  let count = 0;

  for (const row of undoable) {
    const { error: updateError } = await admin
      .from("raffle_numbers")
      .update({
        status: "reserved",
        reserved_by: row.sold_to,
        reserved_until: reservedUntil,
        sold_to: null,
        sold_at: null,
        payment_id: null,
      })
      .eq("raffle_id", raffleId)
      .eq("number", row.number)
      .eq("status", "sold");

    if (!updateError) count += 1;
  }

  try {
    await admin.from("admin_audit_logs").insert({
      admin_id: ctx.id,
      admin_email: ctx.email,
      action: "UNDO_MARK_PAID",
      target_user_id: null,
      target_email: null,
      details: JSON.stringify({
        raffle_id: raffleId,
        numbers: undoable.map((row) => row.number),
        count,
      }),
    });
  } catch (auditError) {
    console.error("[undoMarkReservationPaid] auditoría:", auditError);
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${raffleId}`);
  revalidatePath(`/admin/sorteos/${raffleId}/numeros`);
  revalidatePath(`/sorteos/${raffleId}`);

  return { ok: true, count };
}

export type DrawResult =
  | { ok: true; winningNumber: number }
  | { ok: false; error: string };

/**
 * Ejecuta el sorteo desde el servidor (RPC `draw_winner`) y avisa por email al
 * ganador. El RPC sigue validando dueño, compromiso publicado y estado.
 */
export async function drawWinner(raffleId: string): Promise<DrawResult> {
  const ctx = await requireAdminSession();
  if (!ctx) return { ok: false, error: "No autorizado" };

  const id = uuidSchema.safeParse(raffleId);
  if (!id.success) return { ok: false, error: firstIssue(id.error) };

  const supabase = createClient();

  const { data: raffle } = await supabase
    .from("raffles")
    .select("draw_date")
    .eq("id", id.data)
    .maybeSingle();

  if (!raffle) return { ok: false, error: "El sorteo no existe." };

  const drawAt = new Date(raffle.draw_date).getTime();
  if (Number.isFinite(drawAt) && Date.now() < drawAt) {
    const when = new Date(drawAt).toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      dateStyle: "short",
      timeStyle: "short",
    });
    return {
      ok: false,
      error: `El sorteo está programado para el ${when}. El botón se habilita a esa hora.`,
    };
  }

  const { data, error } = await supabase.rpc("draw_winner", {
    p_raffle_id: id.data,
  });

  if (error) return { ok: false, error: error.message };

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        winning_number?: number;
        winner_user?: string | null;
      }
    | null;

  const winningNumber = Number(row?.winning_number ?? 0);
  if (!winningNumber) {
    return { ok: false, error: "No se pudo determinar el ganador." };
  }

  const title = await raffleTitle(id.data);
  await notifyWinner(id.data, row?.winner_user ?? null, winningNumber, title);

  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${id.data}`);
  revalidatePath(`/sorteos/${id.data}`);
  revalidatePath("/ganadores");

  return { ok: true, winningNumber };
}

export async function cloneRaffle(raffleId: string) {
  const ctx = await requireAdminSession();
  if (!ctx) return { ok: false, error: "No autorizado" };
  if (!(await ownsRaffle(raffleId))) {
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

/**
 * Publica el compromiso del sorteo (hash de una semilla que genera el
 * servidor y que nadie ve hasta el sorteo). A partir de acá el compromiso es
 * público e inmutable: es lo que permite probar que el ganador no se eligió
 * después de conocer los números.
 */
export async function publishDrawCommitment(
  raffleId: string,
): Promise<ActionResult> {
  const ctx = await requireAdminSession();
  if (!ctx) return { ok: false, error: "No autorizado" };

  const id = uuidSchema.safeParse(raffleId);
  if (!id.success) return { ok: false, error: firstIssue(id.error) };

  if (!(await ownsRaffle(id.data))) {
    return { ok: false, error: "No autorizado" };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("commit_draw_seed", {
    p_raffle_id: id.data,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${id.data}`);
  revalidatePath(`/sorteos/${id.data}`);
  return { ok: true };
}
