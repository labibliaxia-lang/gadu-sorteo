"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Star, X } from "lucide-react";

import {
  averageRating,
  formatRating,
  type PublicReview,
} from "@/lib/reviews";
import { createReview, replyToReview } from "@/app/reviews/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDateTime } from "@/lib/utils";

function Stars({
  value,
  size = "h-4 w-4",
}: {
  value: number;
  size?: string;
}) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            size,
            star <= Math.round(value)
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}

/** Lista pública de reseñas con promedio y respuestas del organizador. */
export function ReviewSection({
  reviews,
  organizerName,
}: {
  reviews: PublicReview[];
  organizerName?: string;
}) {
  const average = averageRating(reviews);

  return (
    <section id="resenas" className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Reseñas</h2>
          <p className="text-sm text-muted-foreground">
            Solo compradores con números pagados en sorteos finalizados.
          </p>
        </div>
        {reviews.length > 0 && (
          <div className="flex items-center gap-2 rounded-full border px-3 py-1.5">
            <Stars value={average} />
            <span className="text-sm font-semibold">
              {formatRating(average)}
            </span>
            <span className="text-xs text-muted-foreground">
              ({reviews.length} reseña{reviews.length === 1 ? "" : "s"})
            </span>
          </div>
        )}
      </div>

      {reviews.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Todavía no hay reseñas de {organizerName || "este organizador"}.
        </p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {review.user_name || "Comprador"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(review.created_at)}
                  </p>
                </div>
                <Stars value={review.rating} />
              </div>

              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                {review.comment}
              </p>

              {review.reply && (
                <div className="mt-3 rounded-lg border-l-2 border-amber-500 bg-muted/40 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <MessageCircle className="h-3.5 w-3.5" />
                    Respuesta del organizador
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                    {review.reply}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Modal para que un comprador verificado califique un sorteo terminado. */
export function ReviewFormDialog({
  raffleId,
  organizerName,
  open,
  onClose,
  onSaved,
}: {
  raffleId: string;
  organizerName: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    setError(null);
    setMessage(null);

    const result = await createReview({
      raffle_id: raffleId,
      rating,
      comment,
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMessage(result.message ?? "Reseña publicada.");
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-dialog-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 id="review-dialog-title" className="text-lg font-semibold">
              Calificar a {organizerName}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Solo compradores verificados de este sorteo pueden opinar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-1" role="radiogroup" aria-label="Calificación">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={rating === star}
              aria-label={`${star} estrella${star === 1 ? "" : "s"}`}
              onClick={() => setRating(star)}
              className="rounded-md p-1"
            >
              <Star
                className={cn(
                  "h-8 w-8 transition",
                  star <= rating
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/40",
                )}
              />
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">
            Comentario (máximo 500 caracteres)
          </span>
          <Textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={500}
            rows={4}
            placeholder="Contá cómo fue tu experiencia…"
          />
        </label>
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {comment.trim().length}/500
        </p>

        {error && (
          <p className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-2 rounded-md bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-300">
            {message}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={busy || comment.trim().length < 3}
          >
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Star className="mr-1.5 h-4 w-4" />
            )}
            Publicar reseña
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Formulario de respuesta del organizador a una reseña. */
export function ReviewReplyForm({
  reviewId,
  initialReply,
  onSaved,
}: {
  reviewId: string;
  initialReply: string | null;
  onSaved?: () => void;
}) {
  const [reply, setReply] = useState(initialReply ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setMessage(null);

    const result = await replyToReview({ review_id: reviewId, reply });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMessage(result.message ?? "Respuesta guardada.");
    onSaved?.();
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={reply}
        onChange={(event) => setReply(event.target.value)}
        maxLength={500}
        rows={3}
        placeholder="Respondé públicamente a esta reseña…"
        aria-label="Respuesta del organizador"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => void submit()}
          disabled={busy || reply.trim().length < 2}
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <MessageCircle className="mr-1.5 h-4 w-4" />
          )}
          {initialReply ? "Actualizar respuesta" : "Responder"}
        </Button>
        {message && (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">
            {message}
          </span>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}
