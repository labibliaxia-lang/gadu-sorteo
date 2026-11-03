"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Play, Trophy } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";

interface LiveDrawAnimationProps {
  raffleId: string;
  initialStatus: string;
  initialWinner: number | null;
  soldCount: number;
  /** El usuario actual puede sortear (organizador dueño o superadmin). */
  canDraw: boolean;
  hasCommitment: boolean;
  /** Muestra de números vendidos para el ciclo de la animación. */
  sampleNumbers: number[];
}

type Phase = "idle" | "spinning" | "done";

/**
 * Sala de sorteo en vivo: el organizador dispara el RPC y todos los presentes
 * reciben el UPDATE de `raffles` por Realtime. La animación frena en el número
 * que ya quedó guardado en la base (no en un número elegido en el navegador).
 */
export function LiveDrawAnimation({
  raffleId,
  initialStatus,
  initialWinner,
  soldCount,
  canDraw,
  hasCommitment,
  sampleNumbers,
}: LiveDrawAnimationProps) {
  const supabase = useRef(createClient()).current;
  const animated = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const samples = useRef(sampleNumbers);

  const [phase, setPhase] = useState<Phase>(
    initialStatus === "drawn" && initialWinner != null ? "done" : "idle",
  );
  const [display, setDisplay] = useState<number | null>(initialWinner);
  const [winner, setWinner] = useState<number | null>(initialWinner);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    samples.current = sampleNumbers;
  }, [sampleNumbers]);

  const runAnimation = useCallback(
    (target: number) => {
      if (animated.current || !Number.isFinite(target)) return;
      animated.current = true;

      setWinner(target);
      setPhase("spinning");

      const numbers = samples.current.length > 0 ? samples.current : [1];
      let tick = 0;
      const totalTicks = 45;

      const step = () => {
        tick += 1;

        if (tick < totalTicks) {
          setDisplay(numbers[Math.floor(Math.random() * numbers.length)]);
          const delay = 45 + Math.pow(tick / totalTicks, 3) * 140;
          timers.current.push(setTimeout(step, delay));
          return;
        }

        setDisplay(target);
        timers.current.push(
          setTimeout(() => {
            setPhase("done");
          }, 700),
        );
      };

      step();
    },
    [],
  );

  useEffect(() => {
    if (initialStatus === "drawn" && initialWinner != null) {
      animated.current = true;
      setWinner(initialWinner);
      setDisplay(initialWinner);
      setPhase("done");
      return;
    }

    const channel = supabase
      .channel(`raffle-live-${raffleId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "raffles",
          filter: `id=eq.${raffleId}`,
        },
        (payload) => {
          const row = payload.new as {
            status?: string;
            winner_number?: number | null;
          };

          if (row.status === "drawn" && typeof row.winner_number === "number") {
            runAnimation(row.winner_number);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [raffleId, initialStatus, initialWinner, runAnimation, supabase]);

  async function startDraw() {
    setBusy(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc(
      "execute_transparent_draw",
      { p_raffle_id: raffleId },
    );

    setBusy(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | { winning_number?: number }
      | null;
    const number = Number(row?.winning_number ?? 0);

    if (!number) {
      setError("El sorteo se ejecutó pero no se pudo leer el ganador.");
      return;
    }

    runAnimation(number);
  }

  const numberLabel =
    display != null ? String(display).padStart(4, "0") : "----";

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-zinc-900 via-zinc-800 to-amber-950 p-8 text-center text-white shadow-xl">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">
          {phase === "done" ? "Resultado final" : "Sorteo en vivo"}
        </p>

        <p
          className={
            phase === "spinning"
              ? "mt-4 font-mono text-6xl font-black tabular-nums tracking-widest sm:text-8xl"
              : "mt-4 font-mono text-6xl font-black tabular-nums tracking-widest text-amber-300 sm:text-8xl"
          }
          aria-live="polite"
        >
          {numberLabel}
        </p>

        {phase === "done" && winner != null ? (
          <div className="mt-4 space-y-1">
            <p className="flex items-center justify-center gap-2 text-lg font-semibold">
              <Trophy className="h-5 w-5 text-amber-400" /> Número ganador
            </p>
            <p className="text-sm text-zinc-300">
              {soldCount} números vendidos participaron.
            </p>
          </div>
        ) : phase === "spinning" ? (
          <p className="mt-4 text-sm text-zinc-300">
            Mezclando los números vendidos…
          </p>
        ) : (
          <p className="mt-4 text-sm text-zinc-300">
            {soldCount} número{soldCount === 1 ? "" : "s"} vendido
            {soldCount === 1 ? "" : "s"} en juego.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {phase === "idle" && canDraw && hasCommitment && soldCount > 0 && (
            <Button size="lg" onClick={() => void startDraw()} disabled={busy}>
              <Play className="mr-2 h-5 w-5" />
              {busy ? "Iniciando…" : "Iniciar sorteo"}
            </Button>
          )}

          {phase === "idle" && canDraw && !hasCommitment && (
            <p className="text-sm text-amber-300">
              Falta publicar el compromiso del sorteo antes de sortear.
            </p>
          )}

          {phase === "idle" && canDraw && hasCommitment && soldCount === 0 && (
            <p className="text-sm text-amber-300">
              Necesitás al menos un número vendido para sortear.
            </p>
          )}

          {phase === "idle" && !canDraw && (
            <p className="text-sm text-zinc-300">
              Esperando que el organizador inicie el sorteo.
            </p>
          )}

          {phase === "done" && (
            <Link
              href={`/sorteos/${raffleId}/verificar`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Ver verificación y certificado
              <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        El número ganador se calcula en la base con la semilla comprometida
        antes del sorteo. La animación solo lo muestra: no lo elige.
      </p>
    </div>
  );
}
