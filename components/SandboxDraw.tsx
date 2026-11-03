"use client";

import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Trophy } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { WinnerCertificate } from "@/components/WinnerCertificate";

interface SandboxResult {
  winning_number: number;
  seed: string;
  commitment: string;
  numbers_hash: string;
  result_hash: string;
  numbers_count: number;
}

const SIM_COUNT = 100;

/**
 * Simulación aislada: llama a `run_sandbox_draw` (solo superadmin) y anima
 * 100 números ficticios. No toca sorteos reales ni la tabla de números.
 */
export function SandboxDraw() {
  const supabase = useRef(createClient()).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [phase, setPhase] = useState<"idle" | "spinning" | "done">("idle");
  const [display, setDisplay] = useState<number | null>(null);
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
      timers.current.push(
        setTimeout(() => setPhase("done"), 700),
      );
    };

    step();
  }

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    setDisplay(null);
    setPhase("idle");

    const { data, error: rpcError } = await supabase.rpc("run_sandbox_draw", {
      p_count: SIM_COUNT,
    });

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
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-muted/20 p-4">
        <p className="text-sm font-semibold">
          Escenario: {SIM_COUNT} números vendidos (1 a {SIM_COUNT})
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Datos simulados en una tabla aparte. No aparecen en la web pública ni
          tocan sorteos reales.
        </p>
        <div className="mt-3 flex max-h-40 flex-wrap gap-1 overflow-y-auto">
          {Array.from({ length: SIM_COUNT }, (_, index) => index + 1).map(
            (number) => (
              <span
                key={number}
                className={
                  phase === "done" && result?.winning_number === number
                    ? "rounded bg-amber-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white"
                    : "rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                }
              >
                {number}
              </span>
            ),
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-gradient-to-br from-zinc-900 via-zinc-800 to-amber-950 p-6 text-center text-white">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">
          Simulador de sorteo
        </p>
        <p className="mt-3 font-mono text-5xl font-black tabular-nums sm:text-6xl">
          {display != null ? String(display).padStart(4, "0") : "----"}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {phase === "idle" && (
            <Button onClick={() => void run()} disabled={busy}>
              <Play className="mr-2 h-4 w-4" />
              {busy ? "Simulando…" : "Simular sorteo con 100 números"}
            </Button>
          )}
          {phase === "done" && (
            <>
              <p className="flex items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 text-sm">
                <Trophy className="h-4 w-4 text-amber-300" />
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
          <p className="mt-3 rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
      </div>

      {result && phase === "done" && (
        <div className="space-y-4 rounded-xl border p-5">
          <h2 className="text-lg font-semibold">Resultado de la simulación</h2>
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Compromiso (hash de semilla)</dt>
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
            sorteo = SHA-256(&quot;...|seed:&lt;semilla&gt;|numbers:1,2,...,100&quot;) ·
            el índice sale de los primeros 60 bits del hash.
          </p>
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
