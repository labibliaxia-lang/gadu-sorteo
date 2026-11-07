"use client";

import { useRouter, useSearchParams } from "next/navigation";

const MONEDAS = [
  { code: "USD", label: "USD" },
  { code: "ARS", label: "ARS" },
  { code: "MXN", label: "MXN" },
  { code: "COP", label: "COP" },
  { code: "CLP", label: "CLP" },
] as const;

/** Selector de moneda de la página pública de planes (query param). */
export function PlanCurrencySelect({ actual }: { actual: string }) {
  const router = useRouter();
  const params = useSearchParams();

  function cambiar(code: string) {
    const next = new URLSearchParams(params.toString());
    if (code === "USD") next.delete("currency");
    else next.set("currency", code);
    const query = next.toString();
    router.push(query ? `/planes?${query}` : "/planes", { scroll: false });
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs text-fg-subtle">
      <span className="font-mono uppercase tracking-[0.08em]">Moneda</span>
      <select
        value={actual}
        onChange={(e) => cambiar(e.target.value)}
        className="rounded-md border border-hairline bg-background px-2 py-1 text-sm text-fg"
      >
        {MONEDAS.map((m) => (
          <option key={m.code} value={m.code}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}
