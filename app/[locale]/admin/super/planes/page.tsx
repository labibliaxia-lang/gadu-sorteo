import { redirect } from "next/navigation";

import { requireSuperadminSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlanConfigEditor } from "@/components/admin/PlanConfigEditor";

export const dynamic = "force-dynamic";

export default async function PlanesConfigPage() {
  const actor = await requireSuperadminSession();
  if (!actor) redirect("/login");

  const admin = createAdminClient();
  const { data } = await admin
    .from("plan_configs")
    .select("*")
    .order("plan_name", { ascending: true });

  const { data: ratesData } = await admin
    .from("exchange_rates")
    .select("currency_code, rate_to_usd, updated_at")
    .in("currency_code", ["ARS", "MXN", "COP", "CLP"]);

  const rates: Partial<Record<"ARS" | "MXN" | "COP" | "CLP", number>> = {};
  let ratesUpdatedAt: string | null = null;
  for (const fila of ratesData ?? []) {
    const codigo = fila.currency_code as "ARS" | "MXN" | "COP" | "CLP";
    rates[codigo] = Number(fila.rate_to_usd);
    if (!ratesUpdatedAt && fila.updated_at) {
      ratesUpdatedAt = new Date(fila.updated_at as string).toLocaleString(
        "es-AR",
      );
    }
  }

  // Orden comercial: de menor a mayor precio.
  const ORDEN = ["free", "organizador", "pro", "premium", "social"];
  const configs = [...(data ?? [])].sort(
    (a, b) =>
      ORDEN.indexOf(a.plan_name as string) -
      ORDEN.indexOf(b.plan_name as string),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurar planes</h1>
        <p className="text-sm text-fg-subtle">
          Límites, precio y funciones incluidas por plan. Se aplica al instante
          en los triggers y en la página pública.
        </p>
      </div>
      <PlanConfigEditor
        inicial={configs as Parameters<typeof PlanConfigEditor>[0]["inicial"]}
        rates={rates}
        ratesUpdatedAt={ratesUpdatedAt}
      />
    </div>
  );
}
