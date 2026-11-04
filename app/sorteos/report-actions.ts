"use server";

import { revalidatePath } from "next/cache";

import { allowRateLimitedAction } from "@/lib/rate-limit";
import { normalizeReportInput, reportErrorMessage } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

export type ReportRaffleResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Denuncia pública de un sorteo.
 *
 * La fila la inserta el PROPIO usuario con su cliente SSR (cookies de sesión):
 * la policy `raffle_reports_insert_own` (0064) exige reporter_id = auth.uid(),
 * que el sorteo siga activo y que no sea suyo. Esta acción NO usa service role:
 * no puede saltarse la RLS ni denunciar en nombre de otra persona.
 *
 * La regla "una denuncia por sorteo y usuario" la garantiza el UNIQUE de la
 * tabla, no un chequeo previo (que tendría carrera entre dos pestañas). El rate
 * limit solo frena el spam de denuncias contra muchos sorteos distintos.
 */
export async function reportRaffle(input: {
  raffleId: string;
  reason: string;
  comment?: string;
}): Promise<ReportRaffleResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Iniciá sesión para denunciar este sorteo." };
  }

  const normalized = normalizeReportInput({
    raffleId: input?.raffleId,
    reason: input?.reason,
    comment: input?.comment,
  });

  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  const { raffleId, reason, comment } = normalized.value;

  // Anti-spam: 10 denuncias por hora y por cuenta. El "una por sorteo" lo
  // garantiza el UNIQUE; esto frena el barrido de muchos sorteos.
  const allowed = await allowRateLimitedAction(`report:${user.id}`, 10, 3600);
  if (!allowed) {
    return {
      ok: false,
      error: "Hiciste demasiadas denuncias seguidas. Probá más tarde.",
    };
  }

  const { error } = await supabase.from("raffle_reports").insert({
    raffle_id: raffleId,
    reporter_id: user.id,
    reason,
    comment,
  });

  if (error) {
    // 23505 (duplicado) y 42501 (RLS) se traducen; el resto no filtra detalles
    // internos al navegador.
    return { ok: false, error: reportErrorMessage(error.code, error.message) };
  }

  revalidatePath(`/sorteos/${raffleId}`);

  return { ok: true, message: "Denuncia enviada. El equipo la va a revisar." };
}
