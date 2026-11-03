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
  winning_number: number;
  commitment: string;
  result_hash: string;
  created_at: string;
}

export default async function SandboxPage() {
  const session = await requireSuperadminSession();
  if (!session) notFound();

  const admin = createAdminClient();
  const { data } = await admin
    .from("draw_sandbox_runs")
    .select(
      "id, numbers_count, winning_number, commitment, result_hash, created_at",
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
          Escenario de prueba aislado: {100} números “vendidos” simulados, la
          misma fórmula SHA-256 del motor real y el certificado del ganador.
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
                  <th className="p-3">Ganador</th>
                  <th className="p-3">result_hash</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-t">
                    <td className="whitespace-nowrap p-3 text-muted-foreground">
                      {formatDateTime(run.created_at)}
                    </td>
                    <td className="p-3">{run.numbers_count}</td>
                    <td className="p-3 font-mono font-semibold">
                      {run.winning_number}
                    </td>
                    <td className="max-w-[20rem] truncate p-3 font-mono text-xs text-muted-foreground">
                      {run.result_hash}
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
