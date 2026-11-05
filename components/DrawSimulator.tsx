"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Hash, Play, RotateCcw, Sparkles, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const POOL_SIZE = 10;
const PICK_SIZE = 3;
const SPIN_MS = 2000;

/**
 * Pool inicial determinista para que el primer render (SSR) coincida con el
 * del cliente y no haya hydration mismatch. Al montar se reemplaza por uno
 * aleatorio.
 */
const INITIAL_POOL = [1042, 1187, 2310, 2874, 3309, 4156, 5021, 6078, 7733, 9042];

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
 * Simulador de sorteo 100 % frontend: no consulta Supabase, no llama APIs,
 * no requiere sesión y no reserva ni vende nada. Todo es estado de React.
 */
export function DrawSimulator() {
  const [pool, setPool] = useState<number[]>(INITIAL_POOL);
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

  // Randomiza la grilla recién en el cliente (evita mismatch de SSR).
  useEffect(() => {
    setPool(buildPool());
    return () => stopTimers();
  }, [stopTimers]);

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
    <div className="space-y-5">
      {phase !== "done" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] leading-relaxed text-fg-subtle">
              Elegí <strong className="font-semibold text-fg">3 números</strong>{" "}
              de estos 10 y tocá «Sortear».
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
              {picked.length}/{PICK_SIZE} elegidos
            </p>
          </div>

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
                    "rounded-lg border px-1 py-2.5 font-mono text-[13px] tabular-nums transition-colors",
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
              Demo educativa · simulación
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
            <div className="rounded-xl border border-hairline bg-ink px-4 py-8 text-center">
              <p className="text-[11px] uppercase tracking-[0.2em] text-brand-accent">
                Sorteando
              </p>
              <p className="mt-2 font-mono text-5xl font-bold tabular-nums text-white sm:text-6xl">
                {display != null ? pad(display) : "----"}
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-brand-500/40 bg-brand-500/5 px-4 py-6 text-center">
            <p className="flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-brand-accent">
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
              Ganador
            </p>
            <p className="mt-2 font-mono text-5xl font-bold tabular-nums text-fg sm:text-6xl">
              {winner != null ? pad(winner) : "----"}
            </p>
            <p className="mt-3 flex items-center justify-center gap-1.5 break-all font-mono text-[10px] text-fg-subtle">
              <Hash className="h-3 w-3 shrink-0" aria-hidden="true" />
              Hash: {hash ? `${hash.slice(0, 16)}…` : "—"}
            </p>
          </div>

          <p className="rounded-lg border border-hairline bg-panel-2 px-3 py-2.5 text-[12px] leading-relaxed text-fg-subtle">
            <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-brand-accent" />
            Esta es una simulación. Así de transparente es nuestro motor real.
          </p>

          <div className="rounded-lg border border-hairline bg-panel-1 px-3 py-2.5">
            <p className="text-[12px] leading-relaxed text-fg-subtle">
              <strong className="font-semibold text-fg">
                Cómo verificar un sorteo real:
              </strong>{" "}
              el sistema publica el Hash antes de sortear. Si los números y el
              ganador coinciden con el Hash, el sorteo es transparente.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-subtle">
              No reserva ni compra nada
            </p>
            <Button variant="secondary" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Otra simulación
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
