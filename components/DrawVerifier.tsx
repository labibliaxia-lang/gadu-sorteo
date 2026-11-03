"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  computeDrawVerification,
  parseNumberList,
} from "@/lib/draw-verify";

interface DrawVerifierProps {
  raffleId: string;
  seed: string;
  commitment: string;
  winnerNumber: number;
  numbersHash: string;
  resultHash: string;
  soldNumbers: number[];
}

interface Check {
  label: string;
  ok: boolean;
}

/**
 * Verificador del sorteo, 100% en el navegador con Web Crypto.
 * No consulta la base: toma lo publicado en la página y permite pegar el
 * listado vendido para recomputar el compromiso, el ganador y las huellas.
 */
export function DrawVerifier({
  raffleId,
  seed,
  commitment,
  winnerNumber,
  numbersHash,
  resultHash,
  soldNumbers,
}: DrawVerifierProps) {
  const [listText, setListText] = useState(soldNumbers.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [computed, setComputed] = useState<{
    commitment: string;
    numbersHash: string;
    resultHash: string;
    winner: number;
  } | null>(null);

  async function verify() {
    setBusy(true);
    setError(null);
    setChecks(null);
    setComputed(null);

    try {
      const numbers = parseNumberList(listText);
      if (numbers.length === 0) {
        setError("Pegá el listado de números vendidos (separados por coma).");
        return;
      }

      const computedDraw = await computeDrawVerification({
        raffleId,
        seed,
        numbers,
      });

      setComputed({
        commitment: computedDraw.commitment,
        numbersHash: computedDraw.numbersHash,
        resultHash: computedDraw.resultHash,
        winner: computedDraw.winner ?? 0,
      });

      setChecks([
        {
          label:
            "La semilla coincide con el compromiso publicado (existía antes del sorteo)",
          ok: computedDraw.commitment === commitment,
        },
        {
          label: "El listado coincide con la huella del listado vendido",
          ok: computedDraw.numbersHash === numbersHash,
        },
        {
          label: "El resultado coincide con la huella del resultado",
          ok: computedDraw.resultHash === resultHash,
        },
        {
          label: "El ganador calculado coincide con el ganador publicado",
          ok: computedDraw.winner === winnerNumber,
        },
      ]);
    } catch {
      setError(
        "No se pudo calcular el hash en este navegador. Probá desde una conexión segura (https).",
      );
    } finally {
      setBusy(false);
    }
  }

  const allOk = checks?.every((check) => check.ok) ?? false;

  return (
    <div className="space-y-3 rounded-md border p-3 text-sm">
      <div>
        <h3 className="font-medium">Verificador automático</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Se ejecuta en tu navegador: no consulta la base. Compara la semilla
          revelada, el listado vendido y el resultado con lo publicado. Podés
          pegar otro listado para comprobar qué pasa si alguien lo cambia.
        </p>
      </div>

      <Textarea
        value={listText}
        onChange={(e) => setListText(e.target.value)}
        rows={3}
        className="font-mono text-xs"
        aria-label="Listado de números vendidos"
        placeholder="1, 5, 12, 30"
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={verify} disabled={busy}>
          {busy ? "Comprobando…" : "Comprobar"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setListText(soldNumbers.join(", "));
            setChecks(null);
            setComputed(null);
            setError(null);
          }}
        >
          Restaurar listado oficial
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {checks && (
        <div className="space-y-2">
          <p
            className={
              allOk
                ? "text-sm font-semibold text-emerald-700 dark:text-emerald-400"
                : "text-sm font-semibold text-destructive"
            }
          >
            {allOk
              ? "✓ Verificado: el resultado es consistente con la semilla comprometida."
              : "✗ Algo no coincide: revisá el listado o los datos publicados."}
          </p>

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

          {computed && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                Ganador calculado:{" "}
                <span className="font-mono font-semibold text-foreground">
                  {computed.winner}
                </span>
              </p>
              <details>
                <summary className="cursor-pointer">
                  Ver valores calculados
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="break-all">
                    commitment:{" "}
                    <code className="font-mono">{computed.commitment}</code>
                  </p>
                  <p className="break-all">
                    numbers_hash:{" "}
                    <code className="font-mono">{computed.numbersHash}</code>
                  </p>
                  <p className="break-all">
                    result_hash:{" "}
                    <code className="font-mono">{computed.resultHash}</code>
                  </p>
                </div>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
