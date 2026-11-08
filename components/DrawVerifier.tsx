"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("DrawVerifier");
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

  const verificarLista = useCallback(
    async (texto: string) => {
      setBusy(true);
      setError(null);
      setChecks(null);
      setComputed(null);

      try {
        const numbers = parseNumberList(texto);
        if (numbers.length === 0) {
          setError(t("emptyList"));
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
            label: t("seedCheck"),
            ok: computedDraw.commitment === commitment,
          },
          {
            label: t("numbersCheck"),
            ok: computedDraw.numbersHash === numbersHash,
          },
          {
            label: t("resultCheck"),
            ok: computedDraw.resultHash === resultHash,
          },
          {
            label: t("winnerCheck"),
            ok: computedDraw.winner === winnerNumber,
          },
        ]);
      } catch {
        setError(t("computeError"));
      } finally {
        setBusy(false);
      }
    },
    [raffleId, seed, commitment, numbersHash, resultHash, winnerNumber, t],
  );

  /**
   * Se llama «Verificador automático» y hasta ahora no verificaba nada hasta
   * apretar «Comprobar»: el visitante veía cuatro huellas y ningún resultado,
   * que es justo lo contrario de lo que la sección promete. Ahora corre solo al
   * abrir, con el listado oficial ya cargado. El botón queda para reejecutar
   * después de pegar otro listado.
   */
  const yaVerifico = useRef(false);
  useEffect(() => {
    if (yaVerifico.current) return;
    if (soldNumbers.length === 0) return;
    yaVerifico.current = true;
    void verificarLista(soldNumbers.join(", "));
  }, [verificarLista, soldNumbers]);

  function verify() {
    void verificarLista(listText);
  }

  const allOk = checks?.every((check) => check.ok) ?? false;

  return (
    <div className="space-y-3 rounded-md border p-3 text-sm">
      <div>
        <h3 className="font-medium">{t("title")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <Textarea
        value={listText}
        onChange={(e) => setListText(e.target.value)}
        rows={3}
        className="font-mono text-xs"
        aria-label={t("inputAria")}
        placeholder={t("inputPlaceholder")}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={verify} disabled={busy}>
          {busy ? t("verifying") : t("verify")}
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
          {t("reset")}
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
            {allOk ? t("allOk") : t("someFail")}
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
                {t("computedWinner")}{" "}
                <span className="font-mono font-semibold text-foreground">
                  {computed.winner}
                </span>
              </p>
              <details>
                <summary className="cursor-pointer">
                  {t("showValues")}
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
