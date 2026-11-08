"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Loader2, Undo2 } from "lucide-react";

import {
  refundAndRelease,
  registerPayment,
} from "@/app/[locale]/admin/sorteos/[id]/ventas/actions";
import { Button } from "@/components/ui/button";

/**
 * Acciones de la planilla de ventas.
 *
 * - Devolver y liberar: se eligen los números (no siempre son todos) y se pide
 *   motivo; la base registra la devolución por lo cobrado y audita.
 * - Registrar pago: para números vendidos a mano que todavía no tienen pago.
 */
export function VentasAcciones({
  raffleId,
  numbers,
  nombre,
  sinPago,
  precio,
}: {
  raffleId: string;
  numbers: number[];
  nombre: string;
  sinPago: number[];
  precio: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  // Arranca VACÍO a propósito: antes venía todo marcado y tocar un número lo
  // desmarcaba, así que se devolvían los que NO se habían elegido.
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState<"refund" | "pay" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function alternar(numero: number) {
    setSeleccion((prev) =>
      prev.includes(numero)
        ? prev.filter((n) => n !== numero)
        : [...prev, numero].sort((a, b) => a - b),
    );
  }

  function devolver() {
    if (seleccion.length === 0) {
      setError("Elegí al menos un número.");
      return;
    }
    if (motivo.trim().length < 10) {
      setError("El motivo tiene que tener al menos 10 caracteres.");
      return;
    }

    const confirmar = window.confirm(
      `Se va a registrar una devolución por estos números:\n\n${seleccion.join(", ")}\n\nSiguen vendidos hasta que marques la devolución como pagada.\n\n¿Continuar?`,
    );
    if (!confirmar) return;

    setBusy("refund");
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const res = await refundAndRelease(raffleId, seleccion, motivo);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAviso(
        `${res.count} número(s) en devolución. Se liberan cuando la marques pagada.`,
      );
      setAbierto(false);
      setMotivo("");
      setSeleccion([]);
      router.refresh();
    });
  }

  function registrarPago() {
    const sugerido = (sinPago.length * precio).toFixed(2);
    const texto = window.prompt(
      `Importe cobrado por ${sinPago.length} número(s) de ${nombre}:`,
      sugerido,
    );
    if (texto === null) return;

    const monto = Number(texto.replace(",", "."));
    if (!Number.isFinite(monto) || monto <= 0) {
      setError("El importe tiene que ser un número mayor que cero.");
      return;
    }

    setBusy("pay");
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const res = await registerPayment(raffleId, sinPago, monto);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAviso(`Pago registrado por ${res.count} número(s).`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setAbierto((v) => !v);
            setError(null);
            setAviso(null);
          }}
          disabled={busy !== null}
        >
          <Undo2 className="mr-1.5 h-4 w-4" />
          Devolver
        </Button>

        {sinPago.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={registrarPago}
            disabled={busy !== null || pending}
          >
            {busy === "pay" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Banknote className="mr-1.5 h-4 w-4" />
            )}
            Registrar pago
          </Button>
        )}
      </div>

      {abierto && (
        <div className="w-[240px] space-y-2 rounded-lg border border-hairline bg-panel-2 p-2">
          <p className="text-[11px] font-medium">
            Elegí los números a devolver ({seleccion.length} de {numbers.length})
          </p>
          <p className="text-[10px] text-fg-subtle">
            Siguen vendidos hasta que marques la devolución como pagada.
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setSeleccion([...numbers])}
              className="rounded border border-hairline px-2 py-0.5 text-[10px] text-fg-subtle"
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setSeleccion([])}
              className="rounded border border-hairline px-2 py-0.5 text-[10px] text-fg-subtle"
            >
              Ninguno
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {numbers.map((numero) => {
              const marcado = seleccion.includes(numero);
              return (
                <button
                  key={numero}
                  type="button"
                  onClick={() => alternar(numero)}
                  aria-pressed={marcado}
                  className={
                    marcado
                      ? "rounded border border-rose-500/50 bg-rose-500/15 py-0.5 font-mono text-[11px] text-rose-700 dark:text-rose-300"
                      : "rounded border border-hairline bg-panel-1 py-0.5 font-mono text-[11px] text-fg-subtle"
                  }
                >
                  {numero}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (mínimo 10 caracteres)"
            className="w-full rounded border border-input bg-background px-2 py-1 text-[11px]"
            aria-label="Motivo de la devolución"
          />

          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={devolver}
            disabled={busy !== null || pending || seleccion.length === 0}
          >
            {busy === "refund" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            Confirmar devolución
          </Button>
        </div>
      )}

      {aviso && (
        <p className="max-w-[240px] text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          {aviso}
        </p>
      )}
      {error && (
        <p className="max-w-[240px] text-[11px] text-destructive">{error}</p>
      )}
    </div>
  );
}
