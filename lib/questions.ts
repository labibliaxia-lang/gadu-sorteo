import { z } from "zod";

/** Preguntas y respuestas por sorteo. Texto plano, sin HTML. */

export const questionInputSchema = z.object({
  raffle_id: z.string().uuid("Sorteo inválido"),
  question: z
    .string()
    .trim()
    .min(5, "Escribí una pregunta (mínimo 5 caracteres)")
    .max(300, "La pregunta no puede superar los 300 caracteres"),
});

export const answerInputSchema = z.object({
  question_id: z.string().uuid("Pregunta inválida"),
  answer: z
    .string()
    .trim()
    .min(2, "Escribí una respuesta")
    .max(500, "La respuesta no puede superar los 500 caracteres"),
});

export interface PublicQuestion {
  id: string;
  question: string;
  answer: string | null;
  createdAt: string;
  answeredAt: string | null;
  /** El visitante actual es el autor (se calcula en el servidor). */
  isMine: boolean;
}
