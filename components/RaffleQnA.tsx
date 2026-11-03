"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, Loader2, MessageCircle, Trash2 } from "lucide-react";

import {
  answerQuestion,
  askQuestion,
  deleteQuestion,
} from "@/app/qa/actions";
import type { PublicQuestion } from "@/lib/questions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";

function AnswerForm({
  question,
  onDone,
}: {
  question: PublicQuestion;
  onDone: () => void;
}) {
  const [answer, setAnswer] = useState(question.answer ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await answerQuestion({
      question_id: question.id,
      answer,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <div className="mt-2 space-y-2">
      <Textarea
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Respuesta pública del organizador…"
        aria-label="Respuesta"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => void submit()}
          disabled={busy || answer.trim().length < 2}
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <MessageCircle className="mr-1.5 h-4 w-4" />
          )}
          {question.answer ? "Actualizar respuesta" : "Responder"}
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}

/**
 * Sección pública/administrativa de preguntas. Los textos se renderizan como
 * React; nunca se interpreta HTML.
 */
export function RaffleQnA({
  raffleId,
  questions,
  isLoggedIn,
  canAnswer = false,
  canModerate = false,
}: {
  raffleId: string;
  questions: PublicQuestion[];
  isLoggedIn: boolean;
  canAnswer?: boolean;
  canModerate?: boolean;
}) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const sorted = [...questions].sort((a, b) => {
    if (canAnswer) {
      const pendingA = a.answer ? 1 : 0;
      const pendingB = b.answer ? 1 : 0;
      if (pendingA !== pendingB) return pendingA - pendingB;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });

  async function submit() {
    setBusy(true);
    setError(null);
    setMessage(null);

    const result = await askQuestion({ raffle_id: raffleId, question });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setQuestion("");
    setMessage(result.message ?? "Pregunta enviada.");
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("¿Eliminar esta pregunta?")) return;

    setDeleting(id);
    setError(null);
    const result = await deleteQuestion(id);
    setDeleting(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section id="preguntas" className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Preguntas de usuarios</h2>
          <p className="text-sm text-muted-foreground">
            Dudas públicas sobre este sorteo, respondidas por el organizador.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {questions.length} pregunta{questions.length === 1 ? "" : "s"}
        </span>
      </div>

      {questions.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Todavía no hay preguntas.{" "}
          {isLoggedIn
            ? "Podés dejar la primera abajo."
            : "Iniciá sesión para preguntar."}
        </p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((item) => (
            <li key={item.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="flex items-start gap-2 text-sm font-medium">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                  <span className="whitespace-pre-line">{item.question}</span>
                </p>
                <div className="flex items-center gap-2">
                  {item.answer ? (
                    <Badge variant="success">Respondida</Badge>
                  ) : (
                    <Badge variant="warning">Pendiente</Badge>
                  )}
                  {(item.isMine || canModerate) && (
                    <button
                      type="button"
                      onClick={() => void remove(item.id)}
                      disabled={deleting === item.id}
                      aria-label="Eliminar pregunta"
                      className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-destructive"
                    >
                      {deleting === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-1 text-xs text-muted-foreground">
                {formatDateTime(item.createdAt)}
              </p>

              {item.answer && (
                <div className="mt-3 rounded-lg border-l-2 border-emerald-600 bg-muted/40 p-3">
                  <p className="text-xs font-semibold">Respuesta del organizador</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                    {item.answer}
                  </p>
                </div>
              )}

              {canAnswer && (
                <AnswerForm
                  question={item}
                  onDone={() => router.refresh()}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {isLoggedIn && !canAnswer && (
        <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
          <label className="block text-sm font-medium" htmlFor="new-question">
            Hacer una pregunta
          </label>
          <Textarea
            id="new-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Ej: ¿El premio se entrega en mano o por envío?"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {question.trim().length}/300 · máximo 3 preguntas por día
            </span>
            <Button
              onClick={() => void submit()}
              disabled={busy || question.trim().length < 5}
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <MessageCircle className="mr-1.5 h-4 w-4" />
              )}
              Enviar pregunta
            </Button>
          </div>
        </div>
      )}

      {!isLoggedIn && !canAnswer && (
        <p className="text-sm text-muted-foreground">
          <a
            href={`/login?next=${encodeURIComponent(`/sorteos/${raffleId}`)}`}
            className="text-amber-800 underline-offset-4 hover:underline dark:text-amber-300"
          >
            Iniciá sesión
          </a>{" "}
          para dejar tu pregunta.
        </p>
      )}

      {error && (
        <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-300">
          {message}
        </p>
      )}
    </section>
  );
}
