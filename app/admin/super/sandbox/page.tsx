import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FlaskConical } from "lucide-react";

import { requireSuperadminSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SandboxDraw } from "@/components/SandboxDraw";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface SandboxRunRow {
  id: string;
  numbers_count: number;
  prizes_count: number;
  winning_number: number | null;
  commitment: string;
  result_hash: string | null;
  results_hash: string | null;
  created_at: string;
}

export default async function SandboxPage() {
  const session = await requireSuperadminSession();
  if (!session) notFound();

  const admin = createAdminClient();
  const { data } = await admin
    .from("draw_sandbox_runs")
    .select(
      "id, numbers_count, prizes_count, winning_number, commitment, result_hash, results_hash, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(10);

  const runs = (data ?? []) as SandboxRunRow[];

  return (
    <div className="space-y-6">
      <Link
        href="/admin/super"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al panel superadmin
      </Link>

      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FlaskConical className="h-6 w-6 text-amber-500" />
          Simulador de sorteo
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Mismo flujo que un sorteo real: primero se publica el compromiso
          (hash de la semilla) y después se ejecutan los premios con la semilla
          revelada y las huellas. Podés elegir hasta 10.000 números y 50
          premios; cada premio tiene su hash y hay un results_hash combinado.
          Nada de esto aparece en la web pública ni modifica sorteos reales.
        </p>
      </header>

      <SandboxDraw />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Últimas simulaciones</h2>
        {runs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Todavía no corriste ninguna simulación.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Números</th>
                  <th className="p-3">Premios</th>
                  <th className="p-3">Ganador 1</th>
                  <th className="p-3">results_hash</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-t">
                    <td className="whitespace-nowrap p-3 text-muted-foreground">
                      {formatDateTime(run.created_at)}
                    </td>
                    <td className="p-3">{run.numbers_count}</td>
                    <td className="p-3">{run.prizes_count}</td>
                    <td className="p-3 font-mono font-semibold">
                      {run.winning_number ?? "Pendiente"}
                    </td>
                    <td className="max-w-[20rem] truncate p-3 font-mono text-xs text-muted-foreground">
                      {run.results_hash ?? run.result_hash ?? "Sin ejecutar"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
