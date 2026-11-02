"use client";

import { useState } from "react";

import { updatePlanPrice } from "@/app/admin/super/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PLANS = [
  { plan: "organizador", label: "Plan Organizador" },
  { plan: "premium", label: "Plan Premium" },
] as const;

interface PlanPricesPanelProps {
  prices: { plan: string; price_ars: number | string }[];
}

/**
 * Precios mensuales de /planes. El superadmin los edita acá y la página
 * pública los lee de la base (migración 0032): no hace falta redeploy.
 */
export function PlanPricesPanel({ prices }: PlanPricesPanelProps) {
  const initial = Object.fromEntries(
    PLANS.map(({ plan }) => {
      const row = prices.find((p) => p.plan === plan);
      return [plan, row ? String(Number(row.price_ars)) : "0"];
    }),
  ) as Record<string, string>;

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(plan: string) {
    setBusy(plan);
    setError(null);
    setMessage(null);

    const result = await updatePlanPrice(plan, values[plan]);

    if (!result.ok) {
      setError(result.error);
    } else {
      setMessage("Precios actualizados. La página /planes ya muestra el cambio.");
    }

    setBusy(null);
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">
        Precio mensual en pesos. Dejá 0 para que la página diga «Consultar».
      </p>

      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          {message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {PLANS.map(({ plan, label }) => (
          <div key={plan} className="space-y-2">
            <Label htmlFor={`price-${plan}`}>{label}</Label>
            <div className="flex gap-2">
              <Input
                id={`price-${plan}`}
                type="number"
                min={0}
                step="0.01"
                value={values[plan]}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [plan]: e.target.value }))
                }
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy !== null}
                onClick={() => save(plan)}
              >
                {busy === plan ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
