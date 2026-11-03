import { z } from "zod";

/**
 * Reseñas verificadas: solo compradores con un número vendido en un sorteo
 * sorteado del organizador. Los textos se renderizan como React, sin HTML.
 */

export const reviewInputSchema = z.object({
  raffle_id: z.string().uuid("Sorteo inválido"),
  rating: z.coerce
    .number()
    .int("La calificación debe ser un número entero")
    .min(1, "Elegí al menos una estrella")
    .max(5, "Máximo 5 estrellas"),
  comment: z
    .string()
    .trim()
    .min(3, "Escribí un comentario (mínimo 3 caracteres)")
    .max(500, "El comentario no puede superar los 500 caracteres"),
});

export const reviewReplySchema = z.object({
  review_id: z.string().uuid("Reseña inválida"),
  reply: z
    .string()
    .trim()
    .min(2, "Escribí una respuesta")
    .max(500, "La respuesta no puede superar los 500 caracteres"),
});

export type ReviewInput = z.infer<typeof reviewInputSchema>;

export interface PublicReview {
  id: string;
  organizer_id: string;
  raffle_id: string;
  user_name: string;
  rating: number;
  comment: string;
  reply: string | null;
  created_at: string;
}

export function averageRating(reviews: { rating: number }[]): number {
  if (reviews.length === 0) return 0;
  const sum = reviews.reduce((total, review) => total + review.rating, 0);
  return sum / reviews.length;
}

export function formatRating(value: number): string {
  return value.toFixed(1);
}
