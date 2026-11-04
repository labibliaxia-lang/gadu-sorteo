"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Flag, Loader2, X } from "lucide-react";

import { reportRaffle } from "@/app/sorteos/report-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  REPORT_COMMENT_MAX_LENGTH,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
} from "@/lib/reports";

/**
 * Botón discreto "Denunciar este sorteo" con modal accesible.
 *
 * Se renderiza junto a las acciones públicas del sorteo. La denuncia viaja por
 * la Server Action `reportRaffle`, que inserta con el cliente del propio usuario
 * (RLS de 0064): acá no hay lógica de permisos que confiar, sólo formulario y
 * mensajes.
 *
 * Sin `window` durante el render: el modal sólo existe después de un clic y los
 * listeners/foco viven en efectos, así que el componente también sirve en SSR.
 */
export function ReportRaffleButton({
  raffleId,
  isLoggedIn,
}: {
  raffleId: string;
  isLoggedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | "">("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  // Cerrar con Escape mientras el modal está abierto.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Llevar el foco al primer control del modal al abrirlo.
  useEffect(() => {
    if (!open) return;
    selectRef.current?.focus();
  }, [open]);

  function closeDialog() {
    setOpen(false);
    setError(null);
    triggerRef.current?.focus();
  }

  async function submit() {
    if (!reason) {
      setError("Elegí un motivo de denuncia.");
      return;
    }

    setBusy(true);
    setError(null);

    const result = await reportRaffle({ raffleId, reason, comment });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSent(true);
    setOpen(false);
    setReason("");
    setComment("");
  }

  // Ya denunció en esta sesión de página: no se ofrece de nuevo (el UNIQUE de
  // la tabla es la garantía real; esto sólo evita el rebote).
  if (sent) {
    return (
      <p
        role="status"
        className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300"
      >
        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
        Denuncia enviada. El equipo la va a revisar.
      </p>
    );
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-label="Denunciar este sorteo"
      >
        <Flag className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        Denunciar este sorteo
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-dialog-title"
          onClick={closeDialog}
        >
          <div
            className="w-full max-w-md rounded-xl border border-hairline bg-panel-1 p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3
                  id="report-dialog-title"
                  className="font-display text-lg font-semibold"
                >
                  Denunciar este sorteo
                </h3>
                <p className="mt-1 text-sm text-fg-subtle">
                  Contanos qué pasa. La denuncia la revisa el equipo y es
                  confidencial.
                </p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                aria-label="Cerrar"
                className="rounded-md p-1 text-fg-muted transition hover:bg-panel-2 hover:text-fg"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {!isLoggedIn ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm">Iniciá sesión para denunciar.</p>
                <Link
                  href={`/login?next=${encodeURIComponent(`/sorteos/${raffleId}`)}`}
                  className={buttonVariants({ size: "sm" })}
                >
                  Iniciar sesión
                </Link>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="report-reason"
                    className="block text-sm font-medium"
                  >
                    Motivo
                  </label>
                  <select
                    id="report-reason"
                    ref={selectRef}
                    value={reason}
                    onChange={(event) =>
                      setReason(event.target.value as ReportReason | "")
                    }
                    disabled={busy}
                    className="flex h-10 w-full rounded-lg border border-hairline bg-panel-1 px-3 py-2 text-sm text-fg focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="" disabled>
                      Elegí un motivo…
                    </option>
                    {REPORT_REASONS.map((value) => (
                      <option key={value} value={value}>
                        {REPORT_REASON_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="report-comment"
                    className="block text-sm font-medium"
                  >
                    Comentario (opcional)
                  </label>
                  <Textarea
                    id="report-comment"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    maxLength={REPORT_COMMENT_MAX_LENGTH}
                    rows={3}
                    disabled={busy}
                    placeholder="Contá qué pasó (opcional)."
                  />
                  <p className="text-right font-mono text-[11px] text-fg-subtle">
                    {comment.length}/{REPORT_COMMENT_MAX_LENGTH}
                  </p>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-md bg-destructive/10 p-2 text-xs text-destructive"
                  >
                    {error}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={closeDialog}
                    disabled={busy}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void submit()}
                    disabled={busy || !reason}
                  >
                    {busy ? (
                      <Loader2
                        className="mr-1.5 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Flag
                        className="mr-1.5 h-4 w-4"
                        aria-hidden="true"
                      />
                    )}
                    {busy ? "Enviando…" : "Enviar denuncia"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
