"use server";

import { revalidatePath } from "next/cache";

import { requireAdminSession } from "@/lib/auth";
import {
  answerInputSchema,
  questionInputSchema,
} from "@/lib/questions";
import { createClient } from "@/lib/supabase/server";

export type QnaActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

function refreshQna(raffleId: string) {
  revalidatePath(`/sorteos/${raffleId}`);
  revalidatePath(`/admin/sorteos/${raffleId}/preguntas`);
  revalidatePath(`/admin/sorteos/${raffleId}`);
}

/** Pregunta pública de un usuario logueado (máx. 3/día por sorteo). */
export async function askQuestion(
  input: unknown,
): Promise<QnaActionResult> {
  const parsed = questionInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Iniciá sesión para preguntar." };

  const { data: raffle } = await supabase
    .from("raffles")
    .select("id, created_by")
    .eq("id", parsed.data.raffle_id)
    .maybeSingle();

  if (!raffle) return { ok: false, error: "El sorteo no existe." };
  if (raffle.created_by === user.id) {
    return {
      ok: false,
      error: "No podés preguntarte en tu propio sorteo.",
    };
  }

  const { error } = await supabase.from("raffle_questions").insert({
    raffle_id: parsed.data.raffle_id,
    user_id: user.id,
    question: parsed.data.question,
  });

  if (error) {
    if (error.message.includes("Máximo 3 preguntas")) {
      return {
        ok: false,
        error: "Llegaste al máximo de 3 preguntas por día en este sorteo.",
      };
    }
    return { ok: false, error: error.message };
  }

  refreshQna(parsed.data.raffle_id);
  return { ok: true, message: "Pregunta enviada." };
}

/** Respuesta del organizador dueño (o superadmin). */
export async function answerQuestion(
  input: unknown,
): Promise<QnaActionResult> {
  const parsed = answerInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const ctx = await requireAdminSession();
  if (!ctx) return { ok: false, error: "No autorizado" };

  const supabase = createClient();

  const { data: row } = await supabase
    .from("raffle_questions")
    .select("id, raffle_id")
    .eq("id", parsed.data.question_id)
    .maybeSingle();

  if (!row) return { ok: false, error: "La pregunta no existe." };

  const { data: raffle } = await supabase
    .from("raffles")
    .select("created_by")
    .eq("id", row.raffle_id)
    .maybeSingle();

  if (!ctx.isSuper && raffle?.created_by !== ctx.id) {
    return { ok: false, error: "No autorizado" };
  }

  const { error } = await supabase
    .from("raffle_questions")
    .update({ answer: parsed.data.answer })
    .eq("id", parsed.data.question_id);

  if (error) return { ok: false, error: error.message };

  refreshQna(row.raffle_id);
  return { ok: true, message: "Respuesta guardada." };
}

/** Borra una pregunta: autor, organizador dueño o superadmin. */
export async function deleteQuestion(
  questionId: string,
): Promise<QnaActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "No autorizado" };

  const { data: row } = await supabase
    .from("raffle_questions")
    .select("id, raffle_id, user_id")
    .eq("id", questionId)
    .maybeSingle();

  if (!row) return { ok: false, error: "La pregunta no existe." };

  const [{ data: raffle }, { data: profile }] = await Promise.all([
    supabase
      .from("raffles")
      .select("created_by")
      .eq("id", row.raffle_id)
      .maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);

  const canDelete =
    row.user_id === user.id ||
    raffle?.created_by === user.id ||
    profile?.role === "superadmin";

  if (!canDelete) return { ok: false, error: "No autorizado" };

  const { error } = await supabase
    .from("raffle_questions")
    .delete()
    .eq("id", questionId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  refreshQna(row.raffle_id);
  return { ok: true, message: "Pregunta eliminada." };
}
