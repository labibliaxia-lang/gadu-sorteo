"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  BarChart3,
  Coins,
  Download,
  Loader2,
  Percent,
  RefreshCw,
  Ticket,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { cn, formatPrice } from "@/lib/utils";

export type AnalyticsRange = "today" | "7d" | "month" | "all";

interface DailyPoint {
  date: string;
  revenue: number;
  payments: number;
}

interface RaffleRow {
  id: string;
  title: string;
  status: string;
  revenue: number;
  sold: number;
  reserved: number;
  visits: number | null;
  conversion: number;
  visitConversion: number | null;
}

interface AnalyticsKpis {
  revenue: number;
  approvedPayments: number;
  totalPayments: number;
  avgTicket: number;
  conversion: number;
  sold: number;
  reserved: number;
  visits: number | null;
  visitConversion: number | null;
  activeRaffles: number;
  totalRaffles: number;
}

interface ComparisonKpis {
  label: string;
  revenue: number;
  approvedPayments: number;
  totalPayments: number;
  avgTicket: number;
  conversion: number;
}

export interface AnalyticsData {
  range: AnalyticsRange;
  generatedAt: string;
  kpis: AnalyticsKpis;
  comparison: ComparisonKpis | null;
  daily: DailyPoint[];
  byRaffle: RaffleRow[];
}

const RANGES: { value: AnalyticsRange; labelKey: string }[] = [
  { value: "today", labelKey: "today" },
  { value: "7d", labelKey: "last7" },
  { value: "month", labelKey: "month" },
  { value: "all", labelKey: "all" },
];

const STATUS_LABEL: Record<string, string> = {
  active: "active",
  closed: "closed",
  drawn: "drawn",
  cancelled: "cancelled",
};

/** Etiquetas de la ventana comparativa que arma la API (fuera de este alcance). */
const COMPARISON_LABEL: Record<string, string> = {
  "día anterior": "previousDay",
  "7 días previos": "previous7d",
  "mes anterior": "previousMonth",
};

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function shortDate(date: string, locale: string): string {
  // "2026-11-02" → "02/11" (es/pt) o "11/02" (en)
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : locale === "pt" ? "pt-BR" : "es-AR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** Variación porcentual contra el período anterior. */
function Delta({
  current,
  previous,
  label,
}: {
  current: number;
  previous: number;
  label: string;
}) {
  const t = useTranslations("AdminAnalytics");

  if (previous === 0) {
    return (
      <span className="text-[11px] text-muted-foreground">
        {current > 0 ? t("delta.noBase") : t("delta.noChange")} ·{" "}
        {t("delta.vs", { label })}
      </span>
    );
  }

  const change = ((current - previous) / previous) * 100;
  const positive = change >= 0;

  return (
    <span
      className={cn(
        "text-[11px] font-medium",
        positive
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-destructive",
      )}
    >
      {positive ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%{" "}
      {t("delta.vs", { label })}
    </span>
  );
}

export function AdvancedAnalytics({ planLabel }: { planLabel?: string }) {
  const t = useTranslations("AdminAnalytics");
  const locale = useLocale();
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (value: AnalyticsRange) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?range=${value}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.message ?? body.error ?? t("error.load"),
        );
      }
      setData((await res.json()) as AnalyticsData);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("error.unexpected"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load(range);
  }, [range, load]);

  const maxRevenue = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.daily.map((d) => d.revenue));
  }, [data]);

  const mobileDaily = useMemo(() => data?.daily.slice(-7) ?? [], [data]);

  const comparisonLabel = (label: string) => {
    const key = COMPARISON_LABEL[label];
    return key ? t(`comparison.${key}`) : label;
  };

  function exportCsv() {
    if (!data) return;

    const rangeKey = RANGES.find((r) => r.value === data.range)?.labelKey;
    const label = rangeKey ? t(`ranges.${rangeKey}`) : data.range;
    const lines: string[] = [];

    lines.push(`${t("csv.reportTitle")};Gadu Sorteos`);
    lines.push(`${t("csv.range")};${label}`);
    lines.push(
      `${t("csv.generated")};${new Date(data.generatedAt).toLocaleString(locale)}`,
    );
    lines.push("");
    lines.push(`${t("csv.kpi")};${t("csv.value")}`);
    lines.push(`${t("csv.revenue")};${data.kpis.revenue}`);
    lines.push(`${t("csv.approvedSales")};${data.kpis.approvedPayments}`);
    lines.push(`${t("csv.participations")};${data.kpis.totalPayments}`);
    lines.push(`${t("csv.avgTicket")};${data.kpis.avgTicket.toFixed(2)}`);
    lines.push(
      `${t("csv.conversion")};${(data.kpis.conversion * 100).toFixed(2)}%`,
    );
    lines.push(`${t("csv.sold")};${data.kpis.sold}`);
    lines.push(`${t("csv.reserved")};${data.kpis.reserved}`);
    lines.push(`${t("csv.visits")};${data.kpis.visits ?? ""}`);
    lines.push(
      `${t("csv.visitConversion")};${
        data.kpis.visitConversion === null
          ? ""
          : (data.kpis.visitConversion * 100).toFixed(2)
      }%`,
    );
    lines.push(`${t("csv.activeRaffles")};${data.kpis.activeRaffles}`);
    lines.push(`${t("csv.totalRaffles")};${data.kpis.totalRaffles}`);
    if (data.comparison) {
      lines.push("");
      lines.push(
        `${t("csv.comparison", {
          label: comparisonLabel(data.comparison.label),
        })};${t("csv.value")}`,
      );
      lines.push(`${t("csv.previousRevenue")};${data.comparison.revenue}`);
      lines.push(`${t("csv.previousSales")};${data.comparison.approvedPayments}`);
      lines.push(
        `${t("csv.previousAvgTicket")};${data.comparison.avgTicket.toFixed(2)}`,
      );
      lines.push(
        `${t("csv.previousConversion")};${(
          data.comparison.conversion * 100
        ).toFixed(2)}%`,
      );
    }
    lines.push("");
    lines.push(t("csv.dailyHeader"));
    data.daily.forEach((d) => {
      lines.push(`${d.date};${d.revenue};${d.payments}`);
    });
    lines.push("");
    lines.push(t("csv.rafflesHeader"));
    data.byRaffle.forEach((r) => {
      const title = `"${r.title.replace(/"/g, '""')}"`;
      lines.push(
        `${title};${r.status};${r.visits ?? ""};${r.sold + r.reserved};${r.sold};${(
          r.conversion * 100
        ).toFixed(2)}%;${r.revenue}`,
      );
    });

    const csv = `\uFEFF${lines.join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `analiticas-${data.range}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const kpis = data?.kpis;

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              disabled={loading}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition",
                range === r.value
                  ? "bg-amber-700 text-white"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {t(`ranges.${r.labelKey}`)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {planLabel && <Badge variant="success">{planLabel}</Badge>}
          <Button
            size="sm"
            variant="outline"
            onClick={() => load(range)}
            disabled={loading}
            aria-label={t("ariaRefresh")}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={exportCsv}
            disabled={!data || loading}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {t("exportCsv")}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700/10 text-emerald-800 dark:text-emerald-300">
              <Coins className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm text-muted-foreground">
                {t("kpi.revenue")}
              </p>
              <p className="truncate font-display text-2xl font-bold">
                {loading || !kpis ? "—" : formatPrice(kpis.revenue, locale)}
              </p>
              {data?.comparison && kpis && (
                <Delta
                  current={kpis.revenue}
                  previous={data.comparison.revenue}
                  label={comparisonLabel(data.comparison.label)}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-800 dark:text-brand-300">
              <Ticket className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm text-muted-foreground">
                {t("kpi.approvedSales")}
              </p>
              <p className="truncate font-display text-2xl font-bold">
                {loading || !kpis ? "—" : kpis.approvedPayments}
              </p>
              {data?.comparison && kpis && (
                <Delta
                  current={kpis.approvedPayments}
                  previous={data.comparison.approvedPayments}
                  label={comparisonLabel(data.comparison.label)}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-steel-100 text-steel-700 dark:bg-steel-700/30 dark:text-steel-200">
              <BarChart3 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm text-muted-foreground">
                {t("kpi.avgTicket")}
              </p>
              <p className="truncate font-display text-2xl font-bold">
                {loading || !kpis ? "—" : formatPrice(kpis.avgTicket, locale)}
              </p>
              {data?.comparison && kpis && (
                <Delta
                  current={kpis.avgTicket}
                  previous={data.comparison.avgTicket}
                  label={comparisonLabel(data.comparison.label)}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-800 dark:text-brand-300">
              <Percent className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm text-muted-foreground">
                {t("kpi.visitConversion")}
              </p>
              <p className="truncate font-display text-2xl font-bold">
                {loading || !kpis ? "—" : pct(kpis.conversion)}
              </p>
              {data?.comparison && kpis && (
                <Delta
                  current={kpis.conversion}
                  previous={data.comparison.conversion}
                  label={comparisonLabel(data.comparison.label)}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Embudo: visitas → pago */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{t("funnel.title")}</p>
            <span className="text-xs text-muted-foreground">
              {t("funnel.note")}
            </span>
            {kpis?.visits === null && (
              <span className="text-xs text-muted-foreground">
                {t("funnel.trackingOff")}
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                {t("funnel.visits")}
              </p>
              <p className="text-lg font-bold">
                {loading || !kpis ? "—" : (kpis.visits ?? "—")}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                {t("funnel.sales")}
              </p>
              <p className="text-lg font-bold">
                {loading || !kpis ? "—" : kpis.approvedPayments}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                {t("funnel.salesPerVisit")}
              </p>
              <p className="text-lg font-bold">
                {loading || !kpis || kpis.visitConversion === null
                  ? "—"
                  : pct(kpis.visitConversion)}
              </p>
            </div>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all"
              style={{
                width: `${Math.min(100, (kpis?.visitConversion ?? 0) * 100)}%`,
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Gráfico de tendencia */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{t("trend.title")}</p>
              <p className="text-xs text-muted-foreground">
                {t("trend.description")}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("trend.days", { count: data?.daily.length ?? 0 })}
            </p>
          </div>

          {loading && !data ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("trend.loading")}
            </div>
          ) : (
            <>
              <div className="flex h-40 items-end gap-1 sm:hidden">
                {mobileDaily.map((d) => {
                  const height = Math.max(2, (d.revenue / maxRevenue) * 100);
                  return (
                    <div
                      key={d.date}
                      className="group relative flex flex-1 flex-col items-center justify-end"
                    >
                      <div
                        className="w-full rounded-t bg-brand-500 transition-all hover:bg-brand-400"
                        style={{ height: `${Math.min(100, height)}%` }}
                        title={t("trend.tooltip", {
                          date: shortDate(d.date, locale),
                          revenue: formatPrice(d.revenue, locale),
                          count: d.payments,
                        })}
                      />
                      <span className="mt-1 text-[9px] text-muted-foreground">
                        {shortDate(d.date, locale)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="hidden h-40 items-end gap-1 sm:flex">
                {(data?.daily ?? []).map((d) => {
                  const height = Math.max(2, (d.revenue / maxRevenue) * 100);
                  return (
                    <div
                      key={d.date}
                      className="group relative flex flex-1 flex-col items-center justify-end"
                    >
                      <div
                        className="w-full rounded-t bg-brand-500 transition-all hover:bg-brand-400"
                        style={{ height: `${Math.min(100, height)}%` }}
                        title={t("trend.tooltip", {
                          date: shortDate(d.date, locale),
                          revenue: formatPrice(d.revenue, locale),
                          count: d.payments,
                        })}
                      />
                      <span className="mt-1 text-[10px] text-muted-foreground">
                        {shortDate(d.date, locale)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground sm:hidden">
                {t("trend.mobileNote", { count: mobileDaily.length })}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detalle por sorteo */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{t("detail.title")}</p>
              <p className="text-xs text-muted-foreground">
                {t("detail.description")}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {t("detail.top", { count: data?.byRaffle.length ?? 0 })}
            </span>
          </div>

          <ResponsiveTable
            rows={data?.byRaffle ?? []}
            getRowKey={(row) => row.id}
            empty={
              <EmptyState
                title={t("detail.emptyTitle")}
                description={t("detail.emptyDescription")}
              />
            }
            columns={[
              {
                key: "raffle",
                header: t("columns.raffle"),
                render: (row) => (
                  <span className="font-medium">{row.title}</span>
                ),
              },
              {
                key: "status",
                header: t("columns.status"),
                render: (row) => (
                  <Badge variant="secondary">
                    {STATUS_LABEL[row.status]
                      ? t(`status.${STATUS_LABEL[row.status]}`)
                      : row.status}
                  </Badge>
                ),
              },
              {
                key: "visits",
                header: t("columns.visits"),
                align: "right",
                render: (row) => (row.visits !== null ? row.visits : "—"),
              },
              {
                key: "participations",
                header: t("columns.participations"),
                align: "right",
                render: (row) => row.sold + row.reserved,
              },
              {
                key: "sales",
                header: t("columns.sales"),
                align: "right",
                render: (row) => row.sold,
              },
              {
                key: "conversion",
                header: t("columns.conversion"),
                align: "right",
                render: (row) => (
                  <span className="font-mono">{pct(row.conversion)}</span>
                ),
              },
              {
                key: "revenue",
                header: t("columns.revenue"),
                align: "right",
                render: (row) => (
                  <span className="font-mono">
                    {formatPrice(row.revenue, locale)}
                  </span>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      {kpis && (
        <p className="text-xs text-muted-foreground">
          {t("inventory", {
            sold: kpis.sold,
            reserved: kpis.reserved,
            active: kpis.activeRaffles,
            total: kpis.totalRaffles,
          })}
        </p>
      )}
    </div>
  );
}
