"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Hash, Play, RotateCcw, Sparkles, Trophy, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const POOL_SIZE = 10;
const PICK_SIZE = 3;
const SPIN_MS = 2000;

function buildPool(): number[] {
  const seen = new Set<number>();
  while (seen.size < POOL_SIZE) {
    seen.add(1 + Math.floor(Math.random() * 9999));
  }
  return Array.from(seen).sort((a, b) => a - b);
}

function pad(value: number): string {
  return String(value).padStart(4, "0");
}

function fakeHash(): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 64; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * Simulador de sorteo 100% frontend.
 * No consulta Supabase, no llama APIs y no reserva ni vende números:
 * todo vive en estado de React (pool, selección, animación y ganador).
 */
export function DrawSimulatorModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [pool, setPool] = useState<number[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [phase, setPhase] = useState<"idle" | "spinning" | "done">("idle");
  const [display, setDisplay] = useState<number | null>(null);
  const [winner, setWinner] = useState<number | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimers = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    intervalRef.current = null;
    timeoutRef.current = null;
  }, []);

  const reset = useCallback(() => {
    stopTimers();
    setPool(buildPool());
    setPicked([]);
    setPhase("idle");
    setDisplay(null);
    setWinner(null);
    setHash(null);
  }, [stopTimers]);

  // Cada apertura arranca limpia.
  useEffect(() => {
    if (open) reset();
    return () => stopTimers();
  }, [open, reset, stopTimers]);

  // Escape para cerrar + bloqueo del scroll de fondo.
  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  function toggle(number: number) {
    if (phase !== "idle") return;

    setPicked((prev) => {
      if (prev.includes(number)) return prev.filter((item) => item !== number);
      if (prev.length >= PICK_SIZE) return prev;
      return [...prev, number];
    });
  }

  function draw() {
    if (picked.length !== PICK_SIZE || phase !== "idle") return;

    setPhase("spinning");
    setWinner(null);
    setHash(null);

    const target = picked[Math.floor(Math.random() * picked.length)];

    intervalRef.current = setInterval(() => {
      setDisplay(pool[Math.floor(Math.random() * pool.length)]);
    }, 70);

    timeoutRef.current = setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setDisplay(target);
      setWinner(target);
      setHash(fakeHash());
      setPhase("done");
    }, SPIN_MS);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="draw-simulator-title"
        className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-hairline bg-panel-1 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div>
            <p className="eyebrow">Demo del motor</p>
            <h2
              id="draw-simulator-title"
              className="mt-1.5 font-display text-xl font-semibold tracking-tight"
            >
              Simulá un sorteo
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            aria-label="Cerrar simulador"
            className="rounded-md border border-hairline p-1.5 text-fg-muted transition-colors hover:border-hairline-strong hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          {phase !== "done" ? (
            <>
              <p className="text-[13px] leading-relaxed text-fg-subtle">
                Elegí <strong className="font-semibold text-fg">3 números</strong>{" "}
                de estos 10 y tocá «Sortear». El ganador se define acá mismo, sin
                tocar nada real.
              </p>

              <div className="grid grid-cols-5 gap-2">
                {pool.map((number) => {
                  const active = picked.includes(number);
                  return (
                    <button
                      key={number}
                      type="button"
                      onClick={() => toggle(number)}
                      disabled={phase !== "idle"}
                      aria-pressed={active}
                      className={cn(
                        "rounded-lg border px-1 py-2 font-mono text-[13px] tabular-nums transition-colors",
                        active
                          ? "border-brand-500 bg-brand-500 text-ink"
                          : "border-hairline bg-panel-2 text-fg-muted hover:border-hairline-strong hover:text-fg",
                        phase !== "idle" && !active && "opacity-40",
                      )}
                    >
                      {pad(number)}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
                  {picked.length}/{PICK_SIZE} elegidos
                </p>
                <Button
                  onClick={draw}
                  disabled={picked.length !== PICK_SIZE || phase === "spinning"}
                >
                  <Play className="mr-2 h-4 w-4" />
                  {phase === "spinning" ? "Sorteando…" : "Sortear"}
                </Button>
              </div>

              {phase === "spinning" && (
                <div className="rounded-xl border border-hairline bg-ink px-4 py-6 text-center">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-brand-accent">
                    Sorteando
                  </p>
                  <p className="mt-2 font-mono text-4xl font-bold tabular-nums text-white sm:text-5xl">
                    {display != null ? pad(display) : "----"}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-brand-500/40 bg-brand-500/5 px-4 py-5 text-center">
                <p className="flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-brand-accent">
                  <Trophy className="h-3.5 w-3.5" />
                  Ganador
                </p>
                <p className="mt-2 font-mono text-5xl font-bold tabular-nums text-fg sm:text-6xl">
                  {winner != null ? pad(winner) : "----"}
                </p>
                <p className="mt-3 flex items-center justify-center gap-1.5 break-all font-mono text-[10px] text-fg-subtle">
                  <Hash className="h-3 w-3 shrink-0" />
                  Hash: {hash ? `${hash.slice(0, 16)}…` : "—"}
                </p>
              </div>

              <p className="rounded-lg border border-hairline bg-panel-2 px-3 py-2.5 text-[12px] leading-relaxed text-fg-subtle">
                <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-brand-accent" />
                Esta es una simulación. Así de transparente es nuestro motor real.
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-subtle">
                  Demo · no reserva ni compra nada
                </p>
                <Button variant="secondary" onClick={reset}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Otra simulación
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
