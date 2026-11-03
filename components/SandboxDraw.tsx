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
import { DrawVerifier } from "@/components/DrawVerifier";
import { WinnerCertificate } from "@/components/WinnerCertificate";

interface SandboxCommitment {
  run_id: string;
  commitment: string;
  numbers: string;
  numbers_count: number;
  created_at: string;
}

interface SandboxResult {
  winning_number: number;
  seed: string;
  commitment: string;
  numbers_hash: string;
  result_hash: string;
  numbers_count: number;
  numbers: string;
}

const SIM_COUNT = 100;

/**
 * Simulador en dos fases, igual al flujo real:
 *   1) publicar el compromiso (hash de la semilla, sin revelarla)
 *   2) ejecutar el sorteo y revelar la semilla + huellas
 *
 * Aislado: usa `draw_sandbox_runs`, no toca raffles, números ni pagos.
 */
export function SandboxDraw() {
  const supabase = useRef(createClient()).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [phase, setPhase] = useState<
    "idle" | "committed" | "spinning" | "done"
  >("idle");
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

  function animateTo(target: number) {
    setPhase("spinning");
    let tick = 0;
    const total = 42;

    const step = () => {
      tick += 1;

      if (tick < total) {
        setDisplay(1 + Math.floor(Math.random() * SIM_COUNT));
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
      "create_sandbox_commitment",
      { p_count: SIM_COUNT },
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
      "execute_sandbox_draw",
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

  const numbersCount = result?.numbers_count ?? commitment?.numbers_count ?? SIM_COUNT;
  const soldNumbers = result?.numbers
    ? result.numbers.split(",").map(Number)
    : Array.from({ length: SIM_COUNT }, (_, index) => index + 1);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-muted/20 p-4">
        <p className="text-sm font-semibold">
          Escenario: {numbersCount} números vendidos simulados (1 a{" "}
          {numbersCount})
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Mismo flujo que un sorteo real: compromiso → ejecución → semilla
          revelada. Todo queda en una tabla aparte y no aparece en la web.
        </p>
        <div className="mt-3 flex max-h-40 flex-wrap gap-1 overflow-y-auto">
          {Array.from({ length: numbersCount }, (_, index) => index + 1).map(
            (number) => (
              <span
                key={number}
                className={
                  phase === "done" && result?.winning_number === number
                    ? "rounded bg-brand-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink"
                    : "rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                }
              >
                {number}
              </span>
            ),
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-ink p-6 text-center text-white">
        <div className="pointer-events-none blueprint-grid absolute inset-0 opacity-20" />
        <p className="relative text-xs uppercase tracking-[0.3em] text-brand-300">
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
                <Trophy className="h-4 w-4 text-brand-300" />
                Ganador simulado: {result?.winning_number}
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
            <KeyRound className="h-4 w-4 text-brand-700 dark:text-brand-300" />
            Paso 1 completado: compromiso publicado
          </p>
          <p className="text-xs text-muted-foreground">
            La semilla está guardada y nadie la ve todavía. El hash ya quedó
            fijo: cuando se ejecute el sorteo, cualquier cambio en la semilla o
            en los números haría que el hash no coincida.
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

          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">
                Compromiso (hash de semilla)
              </dt>
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
              <dt className="text-muted-foreground">result_hash</dt>
              <dd className="break-all font-mono">{result.result_hash}</dd>
            </div>
          </dl>

          <p className="text-xs text-muted-foreground">
            Fórmula: compromiso = SHA-256(&quot;gadu:v1|raffle:&lt;id&gt;|seed:&lt;semilla&gt;&quot;) ·
            sorteo = SHA-256(&quot;...|seed:&lt;semilla&gt;|numbers:1,2,...,N&quot;) ·
            el índice sale de los primeros 60 bits del hash.
          </p>

          <DrawVerifier
            raffleId={commitment?.run_id ?? ""}
            seed={result.seed}
            commitment={result.commitment}
            winnerNumber={result.winning_number}
            numbersHash={result.numbers_hash}
            resultHash={result.result_hash}
            soldNumbers={soldNumbers}
          />

          <WinnerCertificate
            raffleTitle={`Simulación de ${result.numbers_count} números`}
            winnerName="Participante simulado"
            winnerNumber={result.winning_number}
            drawnAt={new Date().toLocaleString("es-AR")}
            verificationHash={result.result_hash}
            verifyUrl="/admin/super/sandbox"
          />
        </div>
      )}
    </div>
  );
}
