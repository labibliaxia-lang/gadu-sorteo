"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Play, Trophy } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";

export interface LiveWinner {
  position: number;
  number: number;
  name: string | null;
  prizeTitle: string | null;
}

interface LiveDrawAnimationProps {
  raffleId: string;
  initialStatus: string;
  initialWinner: number | null;
  /** 0058: ganadores ya guardados en raffle_winners (multipremio). */
  initialWinners?: LiveWinner[];
  soldCount: number;
  /** El usuario actual puede sortear (organizador dueño o superadmin). */
  canDraw: boolean;
  hasCommitment: boolean;
  /** Muestra de números vendidos para el ciclo de la animación. */
  sampleNumbers: number[];
  /** Solo desarrollo: dispara una secuencia falsa de 3 premios. */
  demoWinners?: LiveWinner[];
  /** Simulador público: no toca Supabase y espera un clic para arrancar. */
  isDemo?: boolean;
  simulatedWinners?: LiveWinner[];
}

type Phase = "idle" | "spinning" | "done";

function nombreCorto(fullName: string | null): string {
  const partes = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "Participante";
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1][0]}.`;
}

/**
 * Sala de sorteo en vivo.
 *
 * - Un premio: se comporta como siempre (un único número).
 * - Multipremio (0058): anima cada posición en orden, 2 s de pausa entre
 *   premios, y va llenando el podio. Los números los elige la base; la
 *   animación solo los revela.
 */
export function LiveDrawAnimation({
  raffleId,
  initialStatus,
  initialWinner,
  initialWinners = [],
  soldCount,
  canDraw,
  hasCommitment,
  sampleNumbers,
  demoWinners = [],
  isDemo = false,
  simulatedWinners = [],
}: LiveDrawAnimationProps) {
  const supabase = useRef(createClient()).current;
  const animated = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const samples = useRef(sampleNumbers);

  const [phase, setPhase] = useState<Phase>(
    initialStatus === "drawn"
      ? initialWinners.length > 0 || initialWinner != null
        ? "done"
        : "idle"
      : "idle",
  );
  const [display, setDisplay] = useState<number | null>(initialWinner);
  const [winner, setWinner] = useState<number | null>(initialWinner);
  const [podium, setPodium] = useState<LiveWinner[]>(
    initialStatus === "drawn" ? initialWinners : [],
  );
  const [currentPrize, setCurrentPrize] = useState<LiveWinner | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    samples.current = sampleNumbers;
  }, [sampleNumbers]);

  const limpiarTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  /** Busca en la base los ganadores definitivos (multipremio). */
  const cargarGanadores = useCallback(async (): Promise<LiveWinner[]> => {
    const { data } = await supabase
      .from("raffle_winners")
      .select("position, number, user_name, prize_title")
      .eq("raffle_id", raffleId)
      .order("position", { ascending: true });

    return (data ?? []).map((fila) => ({
      position: Number(fila.position),
      number: Number(fila.number),
      name: (fila.user_name as string | null) ?? null,
      prizeTitle: (fila.prize_title as string | null) ?? null,
    }));
  }, [raffleId, supabase]);

  /**
   * Secuencia: por cada premio corre la ruleta ~2 s, revela el número, lo
   * suma al podio y espera 2 s antes del siguiente.
   */
  const runSequence = useCallback(
    (lista: LiveWinner[]) => {
      if (animated.current || lista.length === 0) return;
      animated.current = true;

      setPhase("spinning");
      const numeros = samples.current.length > 0 ? samples.current : [1];

      const animarPremio = (indice: number) => {
        const premio = lista[indice];
        if (!premio) {
          setPhase("done");
          setCurrentPrize(null);
          return;
        }

        setCurrentPrize(premio);
        let tick = 0;
        const totalTicks = 40;

        const girar = () => {
          tick += 1;
          if (tick < totalTicks) {
            setDisplay(numeros[Math.floor(Math.random() * numeros.length)]);
            const delay = 45 + Math.pow(tick / totalTicks, 3) * 120;
            timers.current.push(setTimeout(girar, delay));
            return;
          }

          setDisplay(premio.number);
          setWinner(premio.number);
          setPodium((prev) => [
            ...prev.filter((p) => p.position !== premio.position),
            premio,
          ]);

          timers.current.push(
            setTimeout(() => animarPremio(indice + 1), 2000),
          );
        };

        girar();
      };

      animarPremio(0);
    },
    [],
  );

  const runSingle = useCallback(
    (target: number) => {
      if (animated.current || !Number.isFinite(target)) return;
      runSequence([
        {
          position: 1,
          number: target,
          name: null,
          prizeTitle: null,
        },
      ]);
    },
    [runSequence],
  );

  // Solo desarrollo: permite ver la animación secuencial sin un sorteo real.
  useEffect(() => {
    if (demoWinners.length === 0) return;
    animated.current = false;
    setPhase("idle");
    setPodium([]);
    timers.current.push(
      setTimeout(() => runSequence(demoWinners), 300),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoWinners.length]);

  // Simulador público: sin Realtime ni consultas. Se dispara con el botón.
  // (El modo `demoWinners` de /en-vivo sigue auto-arrancando en desarrollo.)

  // Estado inicial ya sorteado: mostrar el resultado sin repetir la animación.
  useEffect(() => {
    if (initialStatus !== "drawn") return;
    if (initialWinners.length > 0) {
      animated.current = true;
      const ultimo = initialWinners[initialWinners.length - 1];
      setPodium(initialWinners);
      setWinner(ultimo.number);
      setDisplay(ultimo.number);
      setCurrentPrize(ultimo);
      setPhase("done");
      return;
    }
    if (initialWinner != null) {
      animated.current = true;
      setWinner(initialWinner);
      setDisplay(initialWinner);
      setPhase("done");
    }
  }, [initialStatus, initialWinner, initialWinners]);

  // Espectadores: escuchan el UPDATE de `raffles` y animan lo que quedó en base.
  useEffect(() => {
    if (isDemo) return;
    if (initialStatus === "drawn") return;

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
          if (row.status !== "drawn") return;

          void cargarGanadores().then((lista) => {
            if (lista.length > 0) runSequence(lista);
            else if (typeof row.winner_number === "number") {
              runSingle(row.winner_number);
            }
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      limpiarTimers();
    };
  }, [
    raffleId,
    initialStatus,
    isDemo,
    cargarGanadores,
    runSequence,
    runSingle,
    supabase,
    limpiarTimers,
  ]);

  function reiniciarDemo() {
    animated.current = false;
    limpiarTimers();
    setPodium([]);
    setWinner(null);
    setDisplay(null);
    setCurrentPrize(null);
    setPhase("idle");
    timers.current.push(setTimeout(() => runSequence(simulatedWinners), 250));
  }

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

    const lista = await cargarGanadores();
    if (lista.length > 0) {
      runSequence(lista);
      return;
    }

    const number = Number(row?.winning_number ?? 0);
    if (!number) {
      setError("El sorteo se ejecutó pero no se pudo leer el ganador.");
      return;
    }
    runSingle(number);
  }

  const numberLabel =
    display != null ? String(display).padStart(4, "0") : "----";
  const enJuego = currentPrize
    ? currentPrize.prizeTitle ?? `Premio ${currentPrize.position}`
    : null;

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-xl border border-hairline bg-panel-1 p-8 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand-accent">
          {phase === "done"
            ? "Resultado final"
            : enJuego
              ? `Sorteando · ${enJuego}`
              : "Sorteo en vivo"}
        </p>

        <p
          className={
            phase === "spinning"
              ? "mt-4 font-mono text-6xl font-medium tabular-nums tracking-[0.08em] text-fg sm:text-8xl"
              : "mt-4 font-mono text-6xl font-medium tabular-nums tracking-[0.08em] text-brand-accent sm:text-8xl"
          }
          aria-live="polite"
        >
          {numberLabel}
        </p>

        {phase === "done" && winner != null ? (
          <div className="mt-4 space-y-1">
            <p className="flex items-center justify-center gap-2 text-lg font-semibold">
              <Trophy className="h-5 w-5 text-brand-accent" />
              {podium.length > 1 ? "Ganadores confirmados" : "Número ganador"}
            </p>
            <p className="text-[13px] text-fg-subtle">
              {soldCount} números vendidos participaron.
            </p>
          </div>
        ) : phase === "spinning" ? (
          <p className="mt-4 text-[13px] text-fg-subtle">
            Mezclando los números vendidos…
          </p>
        ) : (
          <p className="mt-4 text-[13px] text-fg-subtle">
            {soldCount} número{soldCount === 1 ? "" : "s"} vendido
            {soldCount === 1 ? "" : "s"} en juego.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {isDemo && phase === "idle" && (
            <Button
              size="lg"
              onClick={() => {
                animated.current = false;
                runSequence(simulatedWinners);
              }}
            >
              <Play className="mr-2 h-5 w-5" />
              Iniciar Simulación
            </Button>
          )}

          {!isDemo && phase === "idle" && canDraw && hasCommitment && soldCount > 0 && (
            <Button size="lg" onClick={() => void startDraw()} disabled={busy}>
              <Play className="mr-2 h-5 w-5" />
              {busy ? "Iniciando…" : "Iniciar sorteo"}
            </Button>
          )}

          {phase === "idle" && canDraw && !hasCommitment && (
            <p className="text-[13px] text-brand-accent">
              Falta publicar el compromiso del sorteo antes de sortear.
            </p>
          )}

          {phase === "idle" && canDraw && hasCommitment && soldCount === 0 && (
            <p className="text-[13px] text-brand-accent">
              Necesitás al menos un número vendido para sortear.
            </p>
          )}

          {!isDemo && phase === "idle" && !canDraw && (
            <p className="text-[13px] text-fg-subtle">
              Esperando que el organizador inicie el sorteo.
            </p>
          )}

          {phase === "done" &&
            (isDemo ? (
              <Button variant="secondary" size="lg" onClick={reiniciarDemo}>
                <Play className="mr-2 h-4 w-4" />
                Repetir simulación
              </Button>
            ) : (
              <>
                <Link
                  href={`/sorteos/${raffleId}/resultados`}
                  className={buttonVariants({ variant: "default" })}
                >
                  <Trophy className="mr-2 h-4 w-4" />
                  Ver Resultados Oficiales
                </Link>
                <Link
                  href={`/sorteos/${raffleId}/verificar`}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Ver verificación y certificado
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
              </>
            ))}
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
      </div>

      {podium.length > 0 && (
        <div className="rounded-xl border border-hairline bg-panel-1/60 p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand-accent">
            {phase === "done" ? "Podio final" : "Podio en vivo"}
          </p>
          <ul className="mt-3 space-y-2">
            {[...podium]
              .sort((a, b) => a.position - b.position)
              .map((ganador) => (
                <li
                  key={ganador.position}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-background/60 px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-accent/15 font-mono text-[11px] font-bold text-brand-accent">
                      {ganador.position}
                    </span>
                    <span className="font-medium">
                      {ganador.prizeTitle ?? `Premio ${ganador.position}`}
                    </span>
                    <span className="text-fg-subtle">
                      {nombreCorto(ganador.name)}
                    </span>
                  </span>
                  <span className="font-mono text-sm tabular-nums text-fg">
                    Nº {String(ganador.number).padStart(4, "0")}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Los ganadores se calculan en la base con la semilla comprometida antes
        del sorteo. La animación solo los muestra: no los elige.
      </p>
    </div>
  );
}
