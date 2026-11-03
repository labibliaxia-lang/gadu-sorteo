"use server";

import { revalidatePath } from "next/cache";

import { reviewInputSchema, reviewReplySchema } from "@/lib/reviews";
import { requireAdminSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ReviewActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

function refreshReviewViews(raffleId?: string) {
  revalidatePath("/mis-numeros");
  revalidatePath("/admin/resenas");
  revalidatePath("/organizador/[slug]", "page");
  if (raffleId) revalidatePath(`/sorteos/${raffleId}`);
}

/** Crea una reseña si el usuario compró al menos un número del sorteo sorteado. */
export async function createReview(
  input: unknown,
): Promise<ReviewActionResult> {
  const parsed = reviewInputSchema.safeParse(input);
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

  if (!user) return { ok: false, error: "Iniciá sesión para calificar." };

  const { data: raffle } = await supabase
    .from("raffles")
    .select("id, created_by, status")
    .eq("id", parsed.data.raffle_id)
    .maybeSingle();

  if (!raffle) return { ok: false, error: "El sorteo no existe." };
  if (raffle.status !== "drawn") {
    return {
      ok: false,
      error: "Solo podés calificar sorteos que ya terminaron.",
    };
  }
  if (!raffle.created_by) {
    return { ok: false, error: "El organizador no está disponible." };
  }
  if (raffle.created_by === user.id) {
    return { ok: false, error: "No podés calificar tu propio sorteo." };
  }

  const { count } = await supabase
    .from("raffle_numbers")
    .select("id", { count: "exact", head: true })
    .eq("raffle_id", parsed.data.raffle_id)
    .eq("status", "sold")
    .eq("sold_to", user.id);

  if (!count) {
    return {
      ok: false,
      error:
        "Solo los compradores verificados (con números pagados) pueden calificar.",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await supabase.from("reviews").insert({
    organizer_id: raffle.created_by,
    user_id: user.id,
    raffle_id: parsed.data.raffle_id,
    user_name: profile?.full_name || "Comprador",
    rating: parsed.data.rating,
    comment: parsed.data.comment,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "Ya calificaste este sorteo. Gracias por tu opinión.",
      };
    }
    return { ok: false, error: error.message };
  }

  refreshReviewViews(parsed.data.raffle_id);
  return { ok: true, message: "¡Gracias! Tu reseña quedó publicada." };
}

/** Responde una reseña: solo el organizador dueño (o superadmin). */
export async function replyToReview(
  input: unknown,
): Promise<ReviewActionResult> {
  const parsed = reviewReplySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const ctx = await requireAdminSession();
  if (!ctx) return { ok: false, error: "No autorizado" };

  const supabase = createClient();

  const { data: review } = await supabase
    .from("reviews")
    .select("id, organizer_id, raffle_id")
    .eq("id", parsed.data.review_id)
    .maybeSingle();

  if (!review) return { ok: false, error: "La reseña no existe." };
  if (review.organizer_id !== ctx.id && !ctx.isSuper) {
    return { ok: false, error: "No autorizado" };
  }

  const { error } = await supabase
    .from("reviews")
    .update({ reply: parsed.data.reply })
    .eq("id", parsed.data.review_id);

  if (error) return { ok: false, error: error.message };

  refreshReviewViews(review.raffle_id);
  return { ok: true, message: "Respuesta guardada." };
}

/** Borra una reseña propia (el organizador no puede borrar reseñas ajenas). */
export async function deleteOwnReview(
  reviewId: string,
): Promise<ReviewActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "No autorizado" };

  const { data: review } = await supabase
    .from("reviews")
    .select("id, raffle_id, user_id")
    .eq("id", reviewId)
    .maybeSingle();

  if (!review) return { ok: false, error: "La reseña no existe." };
  if (review.user_id !== user.id) {
    return { ok: false, error: "No autorizado" };
  }

  const { error } = await supabase
    .from("reviews")
    .delete()
    .eq("id", reviewId);

  if (error) return { ok: false, error: error.message };

  refreshReviewViews(review.raffle_id);
  return { ok: true, message: "Reseña eliminada." };
}
