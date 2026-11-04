"use client";

import { useEffect, useRef, useState } from "react";
import {
  KeyRound,
  Lock,
  Play,
  RotateCcw,
  ShieldCheck,
  Trophy,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { MultiPrizeVerifier } from "@/components/MultiPrizeVerifier";
import { Input } from "@/components/ui/input";
import { WinnerCertificate } from "@/components/WinnerCertificate";

interface SandboxCommitment {
  run_id: string;
  commitment: string;
  numbers: string;
  numbers_count: number;
  prizes_count: number;
  created_at: string;
}

interface SandboxWinner {
  position: number;
  number: number;
  hash: string;
}

interface SandboxResult {
  winning_number: number;
  seed: string;
  commitment: string;
  numbers_hash: string;
  result_hash: string;
  numbers_count: number;
  numbers: string;
  prizes_count: number;
  winners: SandboxWinner[];
  results_hash: string;
}

const MAX_NUMBERS = 10000;
const MAX_PRIZES = 50;
const VISIBLE_NUMBERS = 500;

/**
 * Simulador en dos fases, igual al flujo real:
 *   1) publicar el compromiso (hash de la semilla, sin revelarla)
 *   2) ejecutar el sorteo y revelar la semilla + huellas
 *
 * Multi-premio: el premio 1 usa la fórmula del motor real; los siguientes se
 * calculan sobre los números restantes, sin repetir ganadores. Cada premio
 * tiene su hash y se guarda un results_hash combinado.
 */
export function SandboxDraw() {
  const supabase = useRef(createClient()).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [phase, setPhase] = useState<
    "idle" | "committed" | "spinning" | "done"
  >("idle");
  const [numberCount, setNumberCount] = useState(100);
  const [prizeCount, setPrizeCount] = useState(1);
  const [display, setDisplay] = useState<number | null>(null);
  const [commitment, setCommitment] = useState<SandboxCommitment | null>(null);
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );

  const safeNumbers = Math.max(1, Math.min(MAX_NUMBERS, numberCount || 1));
  const safePrizes = Math.max(
    1,
    Math.min(MAX_PRIZES, safeNumbers, prizeCount || 1),
  );

  function animateTo(target: number) {
    setPhase("spinning");
    let tick = 0;
    const total = 42;

    const step = () => {
      tick += 1;

      if (tick < total) {
        setDisplay(1 + Math.floor(Math.random() * safeNumbers));
        const delay = 45 + Math.pow(tick / total, 3) * 130;
        timers.current.push(setTimeout(step, delay));
        return;
      }

      setDisplay(target);
      timers.current.push(setTimeout(() => setPhase("done"), 700));
    };

    step();
  }

  async function publishCommitment() {
    setBusy(true);
    setError(null);
    setResult(null);
    setDisplay(null);
    setPhase("idle");

    const { data, error: rpcError } = await supabase.rpc(
      "create_sandbox_commitment_v2",
      { p_count: safeNumbers, p_prizes: safePrizes },
    );

    setBusy(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | SandboxCommitment
      | null;

    if (!row?.run_id) {
      setError("La simulación no pudo crear el compromiso.");
      return;
    }

    setCommitment(row);
    setPhase("committed");
  }

  async function executeDraw() {
    if (!commitment) return;

    setBusy(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc(
      "execute_sandbox_draw_v2",
      { p_run_id: commitment.run_id },
    );

    setBusy(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | SandboxResult
      | null;

    if (!row?.winning_number) {
      setError("La simulación no devolvió un ganador.");
      return;
    }

    setResult(row);
    animateTo(row.winning_number);
  }

  function reset() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase("idle");
    setDisplay(null);
    setCommitment(null);
    setResult(null);
    setError(null);
  }

  const activeNumbers = result?.numbers_count ?? commitment?.numbers_count ?? safeNumbers;
  const activePrizes = result?.prizes_count ?? commitment?.prizes_count ?? safePrizes;
  const allNumbers = result?.numbers
    ? result.numbers.split(",").map(Number)
    : Array.from({ length: activeNumbers }, (_, index) => index + 1);
  const visibleNumbers = Math.min(activeNumbers, VISIBLE_NUMBERS);

  function prizeLabel(position: number): string {
    return position === 1 ? "1.er premio" : `${position}º premio`;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
        <p className="text-sm font-semibold">Escenario de la simulación</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="sandbox-numbers" className="text-xs text-muted-foreground">
              Cantidad de números (1 a 10.000)
            </label>
            <Input
              id="sandbox-numbers"
              type="number"
              min={1}
              max={MAX_NUMBERS}
              value={numberCount}
              disabled={phase !== "idle"}
              onChange={(event) =>
                setNumberCount(Number(event.target.value) || 1)
              }
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="sandbox-prizes" className="text-xs text-muted-foreground">
              Cantidad de premios (1 a 50, sin repetir ganador)
            </label>
            <Input
              id="sandbox-prizes"
              type="number"
              min={1}
              max={Math.min(MAX_PRIZES, safeNumbers)}
              value={prizeCount}
              disabled={phase !== "idle"}
              onChange={(event) =>
                setPrizeCount(Number(event.target.value) || 1)
              }
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Escenario aislado: {activeNumbers.toLocaleString("es-AR")} números y{" "}
          {activePrizes} premio{activePrizes === 1 ? "" : "s"}. No aparece en la
          web pública ni toca sorteos reales.
        </p>

        {visibleNumbers < activeNumbers && (
          <p className="text-xs text-muted-foreground">
            Se muestran los primeros {VISIBLE_NUMBERS} números de{" "}
            {activeNumbers.toLocaleString("es-AR")}.
          </p>
        )}

        <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
          {Array.from({ length: visibleNumbers }, (_, index) => index + 1).map(
            (number) => {
              const winner = result?.winners.find(
                (item) => item.number === number,
              );
              return (
                <span
                  key={number}
                  title={winner ? prizeLabel(winner.position) : undefined}
                  className={
                    winner
                      ? "rounded bg-brand-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink"
                      : "rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  }
                >
                  {number}
                </span>
              );
            },
          )}
        </div>
      </div>

      <div className="relative rounded-2xl border border-white/10 bg-ink p-6 text-center text-white">
        <div className="pointer-events-none absolute inset-0 blueprint-grid opacity-20" />
        <p className="relative text-xs uppercase tracking-[0.3em] text-brand-accent">
          Simulador de sorteo
        </p>
        <p className="relative mt-3 font-mono text-5xl font-black tabular-nums sm:text-6xl">
          {display != null ? String(display).padStart(4, "0") : "----"}
        </p>
        <div className="relative mt-4 flex flex-wrap items-center justify-center gap-2">
          {phase === "idle" && (
            <Button onClick={() => void publishCommitment()} disabled={busy}>
              <Lock className="mr-2 h-4 w-4" />
              {busy ? "Publicando…" : "1. Publicar compromiso"}
            </Button>
          )}
          {phase === "committed" && (
            <Button onClick={() => void executeDraw()} disabled={busy}>
              <Play className="mr-2 h-4 w-4" />
              {busy ? "Sorteando…" : "2. Ejecutar sorteo simulado"}
            </Button>
          )}
          {phase === "done" && (
            <>
              <p className="flex items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 text-sm">
                <Trophy className="h-4 w-4 text-brand-accent" />
                {activePrizes} premio{activePrizes === 1 ? "" : "s"} sorteado
                {activePrizes === 1 ? "" : "s"}
              </p>
              <Button variant="secondary" onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Otra simulación
              </Button>
            </>
          )}
        </div>
        {error && (
          <p className="relative mt-3 rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
      </div>

      {commitment && phase !== "done" && (
        <div className="space-y-2 rounded-xl border border-brand-500/30 bg-brand-500/5 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-brand-800 dark:text-brand-300" />
            Paso 1 completado: compromiso publicado
          </p>
          <p className="text-xs text-muted-foreground">
            La semilla está guardada y nadie la ve todavía. El hash ya quedó
            fijo para todos los premios: cuando se ejecute, cualquier cambio en
            la semilla o en los números haría que los hashes no coincidan.
          </p>
          <div>
            <p className="text-xs font-medium">Compromiso (hash de la semilla)</p>
            <code className="mt-1 block break-all rounded-md bg-muted/60 p-3 font-mono text-xs">
              {commitment.commitment}
            </code>
          </div>
        </div>
      )}

      {result && phase === "done" && (
        <div className="space-y-4 rounded-xl border p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">
              Resultado de la simulación
            </h2>
            <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
              Semilla revelada y verificable
            </span>
          </div>

          <div className="space-y-2">
            {result.winners.map((winner) => (
              <div
                key={winner.position}
                className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {prizeLabel(winner.position)}
                  </p>
                  <p className="font-mono text-2xl font-bold text-brand-800 dark:text-brand-200">
                    {String(winner.number).padStart(4, "0")}
                  </p>
                </div>
                <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                  hash: {winner.hash}
                </p>
              </div>
            ))}
          </div>

          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Compromiso</dt>
              <dd className="break-all font-mono">{result.commitment}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Semilla revelada</dt>
              <dd className="break-all font-mono">{result.seed}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">numbers_hash</dt>
              <dd className="break-all font-mono">{result.numbers_hash}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                result_hash (1.er premio)
              </dt>
              <dd className="break-all font-mono">{result.result_hash}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">
                results_hash (todos los premios)
              </dt>
              <dd className="break-all font-mono">{result.results_hash}</dd>
            </div>
          </dl>

          <p className="text-xs text-muted-foreground">
            Fórmula: premio 1 con la misma selección del motor real; premios
            siguientes con SHA-256 sobre los números restantes (sin repetir
            ganador). Cada premio guarda su hash y el conjunto tiene un
            results_hash.
          </p>

          <MultiPrizeVerifier
            raffleId={commitment?.run_id ?? ""}
            seed={result.seed}
            commitment={result.commitment}
            numbers={allNumbers}
            numbersHash={result.numbers_hash}
            winners={result.winners}
            resultsHash={result.results_hash}
          />

          <div className="space-y-3">
            <p className="text-sm font-semibold">Certificados por premio</p>
            {result.winners.map((winner) => (
              <WinnerCertificate
                key={winner.position}
                raffleTitle={`Simulación de ${result.numbers_count} números`}
                prizeLabel={prizeLabel(winner.position)}
                winnerName="Participante simulado"
                winnerNumber={winner.number}
                drawnAt={new Date().toLocaleString("es-AR")}
                verificationHash={winner.hash}
                verifyUrl="/admin/super/sandbox"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
