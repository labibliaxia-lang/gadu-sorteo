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
      />
    </div>
  );
}
