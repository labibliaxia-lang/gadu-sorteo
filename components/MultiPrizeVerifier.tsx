"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  computeMultiPrizeVerification,
  type MultiPrizeWinner,
} from "@/lib/draw-verify";

interface Check {
  label: string;
  ok: boolean;
}

function prizeLabel(position: number): string {
  return position === 1 ? "1.er premio" : `${position}º premio`;
}

/**
 * Verificador de todos los premios del simulador, 100% en el navegador.
 * Recalcula la semilla, el listado, cada ganador/hash y el results_hash.
 */
export function MultiPrizeVerifier({
  raffleId,
  seed,
  commitment,
  numbers,
  numbersHash,
  winners,
  resultsHash,
}: {
  raffleId: string;
  seed: string;
  commitment: string;
  numbers: number[];
  numbersHash: string;
  winners: MultiPrizeWinner[];
  resultsHash: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [matches, setMatches] = useState<Map<number, boolean>>(new Map());

  async function verify() {
    setBusy(true);
    setError(null);
    setChecks(null);
    setMatches(new Map());

    try {
      const computed = await computeMultiPrizeVerification({
        raffleId,
        seed,
        numbers,
        prizesCount: winners.length,
      });

      const prizeMatches = new Map<number, boolean>();
      for (const winner of winners) {
        const expected = computed.winners.find(
          (item) => item.position === winner.position,
        );
        prizeMatches.set(
          winner.position,
          expected?.number === winner.number && expected?.hash === winner.hash,
        );
      }
      setMatches(prizeMatches);

      setChecks([
        {
          label: "La semilla coincide con el compromiso publicado",
          ok: computed.commitment === commitment,
        },
        {
          label: "El listado coincide con numbers_hash",
          ok: computed.numbersHash === numbersHash,
        },
        {
          label: "Los ganadores y sus hashes coinciden uno por uno",
          ok: [...prizeMatches.values()].every(Boolean),
        },
        {
          label: "El results_hash combinado coincide",
          ok: computed.resultsHash === resultsHash,
        },
        {
          label: "No hay ganadores repetidos",
          ok: new Set(winners.map((winner) => winner.number)).size === winners.length,
        },
      ]);
    } catch {
      setError(
        "No se pudo verificar en este navegador. Probá desde una conexión segura (https).",
      );
    } finally {
      setBusy(false);
    }
  }

  const allOk = checks?.every((check) => check.ok) ?? false;

  return (
    <div className="space-y-3 rounded-xl border p-4 text-sm">
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-4 w-4 text-brand-600" />
          Verificador de todos los premios
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Recalcula en tu navegador la semilla, el listado, el ganador y el hash
          de cada premio, más el results_hash combinado.
        </p>
      </div>

      <ul className="space-y-2">
        {winners.map((winner) => {
          const checked = matches.has(winner.position);
          const ok = matches.get(winner.position) ?? false;
          return (
            <li
              key={winner.position}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 p-2.5"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold">
                  {prizeLabel(winner.position)}
                </p>
                <p className="font-mono text-sm">
                  Nº {String(winner.number).padStart(4, "0")}
                </p>
              </div>
              {checked &&
                (ok ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Coincide
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-destructive">
                    <XCircle className="h-4 w-4" />
                    No coincide
                  </span>
                ))}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void verify()}
          disabled={busy}
        >
          {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {busy ? "Verificando…" : `Verificar los ${winners.length} premio(s)`}
        </Button>
        {checks && (
          <span
            className={
              allOk
                ? "text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                : "text-xs font-semibold text-destructive"
            }
          >
            {allOk
              ? "✓ Todos los premios coinciden"
              : "✗ Algún premio no coincide"}
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {checks && (
        <ul className="space-y-1.5 text-xs">
          {checks.map((check) => (
            <li key={check.label} className="flex items-start gap-2">
              {check.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
              <span
                className={
                  check.ok ? "text-muted-foreground" : "text-destructive"
                }
              >
                {check.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
