import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, FlaskConical } from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
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
  const t = await getTranslations("AdminSuperSandbox");
  const locale = await getLocale();
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
      <LocaleLink
        href="/admin/super"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </LocaleLink>

      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FlaskConical className="h-6 w-6 text-amber-500" />
          {t("title")}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("description")}
        </p>
      </header>

      <SandboxDraw />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("lastRuns")}</h2>
        {runs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">{t("date")}</th>
                  <th className="p-3">{t("numbers")}</th>
                  <th className="p-3">{t("prizes")}</th>
                  <th className="p-3">{t("winner1")}</th>
                  <th className="p-3">{t("resultsHash")}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-t">
                    <td className="whitespace-nowrap p-3 text-muted-foreground">
                      {formatDateTime(run.created_at, locale)}
                    </td>
                    <td className="p-3">{run.numbers_count}</td>
                    <td className="p-3">{run.prizes_count}</td>
                    <td className="p-3 font-mono font-semibold">
                      {run.winning_number ?? t("pending")}
                    </td>
                    <td className="max-w-[20rem] truncate p-3 font-mono text-xs text-muted-foreground">
                      {run.results_hash ?? run.result_hash ?? t("notRun")}
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
