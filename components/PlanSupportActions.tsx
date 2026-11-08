"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  extendUserPlan,
  type PlanId,
} from "@/app/[locale]/admin/super/actions";

const PLAN_OPTIONS: { value: PlanId; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "organizador", label: "Starter" },
  { value: "pro", label: "Pro" },
  { value: "premium", label: "Premium" },
  { value: "social", label: "Social / ONG" },
];

const DAYS_OPTIONS = [30, 60, 90, 180, 365];

/**
 * Registra un pago manual de plan y extiende la vigencia desde la ficha de
 * soporte. El servidor valida superadmin, plan y tope de días.
 */
export function PlanSupportActions({
  userId,
  currentPlan,
}: {
  userId: string;
  currentPlan: PlanId | null;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<PlanId>(currentPlan ?? "organizador");
  const [days, setDays] = useState(30);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("transferencia");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setMessage(null);

    const amountNumber = Number(amount.replace(",", "."));

    const result = await extendUserPlan({
      userId,
      plan,
      days,
      amount: Number.isFinite(amountNumber) ? amountNumber : 0,
      method,
      note,
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setAmount("");
    setNote("");
    setMessage(`Plan extendido hasta ${result.expiresAt}.`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Plan</span>
          <select
            value={plan}
            onChange={(event) => setPlan(event.target.value as PlanId)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            {PLAN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">
            Días a sumar
          </span>
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            {DAYS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} días
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">
            Monto (ARS)
          </span>
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="0"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Medio</span>
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="otro">Otro</option>
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted-foreground">
          Nota (opcional)
        </span>
        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={300}
          placeholder="Ej: transferencia del 03/11, comprobante 123"
        />
      </label>

      <Button onClick={() => void submit()} disabled={busy}>
        {busy ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <CreditCard className="mr-1.5 h-4 w-4" />
        )}
        Registrar pago y extender plan
      </Button>

      {message && (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          {message}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
