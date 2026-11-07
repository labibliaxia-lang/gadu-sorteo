"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { guardarPlanes, type PlanConfigInput } from "@/app/admin/super/planes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/utils";

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

export function PlanConfigEditor({ inicial }: { inicial: PlanConfigRow[] }) {
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

              <label className="space-y-1 text-xs">
                <span className="block text-fg-subtle">
                  Precio ARS ({formatPrice(Number(fila.price_ars))})
                </span>
                <Input
                  type="number"
                  min={0}
                  value={String(fila.price_ars)}
                  onChange={(e) =>
                    cambiar(index, { price_ars: Number(e.target.value) })
                  }
                />
              </label>
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
