"use client";

import { useState } from "react";
import { Loader2, Lock } from "lucide-react";

import { guardarPlanes, type PlanConfigInput } from "@/app/[locale]/admin/super/planes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPriceIn } from "@/lib/utils";

export interface PlanConfigRow extends PlanConfigInput {
  label: string;
}

const CAMPOS: {
  key: keyof PlanConfigInput;
  label: string;
  min?: number;
  max?: number;
}[] = [
  { key: "max_raffles", label: "Sorteos activos", min: 0, max: 1000 },
  { key: "max_numbers", label: "Números", min: 10, max: 10000 },
  { key: "max_prizes", label: "Premios", min: 1, max: 30 },
  { key: "max_referrals_per_raffle", label: "Referidos (0 = sin tope)", min: 0, max: 1000 },
];

const TOGGLES: { key: keyof PlanConfigInput; label: string }[] = [
  { key: "allow_referrals", label: "Referidos" },
  { key: "allow_landing", label: "Landing" },
  { key: "allow_mp", label: "Mercado Pago" },
  { key: "allow_auto_draw", label: "Auto-sorteo" },
];

export function PlanConfigEditor({
  inicial,
  rates = {},
  ratesUpdatedAt = null,
}: {
  inicial: PlanConfigRow[];
  rates?: Partial<Record<"ARS" | "MXN" | "COP" | "CLP", number>>;
  ratesUpdatedAt?: string | null;
}) {
  const [filas, setFilas] = useState<PlanConfigRow[]>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cambiar(index: number, cambios: Partial<PlanConfigRow>) {
    setFilas((prev) =>
      prev.map((fila, i) => (i === index ? { ...fila, ...cambios } : fila)),
    );
  }

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    setError(null);

    const res = await guardarPlanes(filas);
    setGuardando(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMensaje("Planes guardados.");
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {mensaje && (
        <p className="rounded-md bg-emerald-500/10 p-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          {mensaje}
        </p>
      )}

      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
        <p className="font-semibold">
          Cotización actual: 1 USD ={" "}
          {rates.ARS ? `$${rates.ARS.toLocaleString("es-AR")} ARS` : "— ARS"} /{" "}
          {rates.MXN ? `$${rates.MXN.toLocaleString("es-AR")} MXN` : "— MXN"} /{" "}
          {rates.COP ? `$${rates.COP.toLocaleString("es-AR")} COP` : "— COP"} /{" "}
          {rates.CLP ? `$${rates.CLP.toLocaleString("es-AR")} CLP` : "— CLP"}
        </p>
        <p className="mt-1 text-[11px] opacity-80">
          Se actualiza sola con el cron de cotizaciones
          {ratesUpdatedAt ? ` · última corrida: ${ratesUpdatedAt}` : ""}. Los
          precios locales son de solo lectura: salen de multiplicar el precio
          USD por la cotización.
        </p>
      </div>

      <div className="space-y-4">
        {filas.map((fila, index) => (
          <section
            key={fila.plan_name}
            className="space-y-3 rounded-xl border border-hairline bg-panel-1 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{fila.label}</h2>
              <span className="font-mono text-[11px] text-fg-subtle">
                {fila.plan_name}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-5">
              {CAMPOS.map((campo) => (
                <label key={campo.key} className="space-y-1 text-xs">
                  <span className="block text-fg-subtle">{campo.label}</span>
                  <Input
                    type="number"
                    min={campo.min}
                    max={campo.max}
                    value={String(fila[campo.key])}
                    onChange={(e) =>
                      cambiar(index, {
                        [campo.key]: Number(e.target.value),
                      } as Partial<PlanConfigRow>)
                    }
                  />
                </label>
              ))}

              {/* Único precio editable: el USD. Los locales se calculan solos. */}
              <label className="space-y-1 text-xs">
                <span className="flex items-center justify-between gap-2 text-fg-subtle">
                  <span>Precio Base (USD)</span>
                  <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                    Editable
                  </span>
                </span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={String(fila.price_usd)}
                  onChange={(e) =>
                    cambiar(index, { price_usd: Number(e.target.value) })
                  }
                  className="border-amber-500/60 bg-background font-mono"
                />
              </label>

              {(
                [
                  ["price_ars", "ARS"],
                  ["price_mxn", "MXN"],
                  ["price_cop", "COP"],
                  ["price_clp", "CLP"],
                ] as const
              ).map(([campo, moneda]) => (
                <div key={campo} className="space-y-1 text-xs">
                  <span className="block text-fg-subtle">
                    Precio Local ({moneda})
                  </span>
                  <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-[7px]">
                    <span className="font-mono text-sm text-fg">
                      {formatPriceIn(Number(fila[campo]), moneda)}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 text-[10px] text-fg-subtle"
                      title="Se calcula solo desde el precio USD y la cotización del día"
                    >
                      <Lock className="h-3 w-3" aria-hidden="true" />
                      Auto
                    </span>
                  </div>
                </div>
              ))}
              <p className="col-span-full text-[10px] text-fg-subtle">
                Los precios locales se recalculan solos desde el precio USD y la
                cotización del día (cron de cotizaciones). No se editan a mano.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              {TOGGLES.map((toggle) => (
                <label
                  key={toggle.key}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={Boolean(fila[toggle.key])}
                    onChange={(e) =>
                      cambiar(index, {
                        [toggle.key]: e.target.checked,
                      } as Partial<PlanConfigRow>)
                    }
                  />
                  {toggle.label}
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Button onClick={() => void guardar()} disabled={guardando}>
        {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        {guardando ? "Guardando…" : "Guardar planes"}
      </Button>
    </div>
  );
}
