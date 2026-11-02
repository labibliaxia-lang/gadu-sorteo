"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  payments: number;
}

interface AnalyticsKpis {
  revenue: number;
  approvedPayments: number;
  totalPayments: number;
  avgTicket: number;
  conversion: number;
  sold: number;
  reserved: number;
  activeRaffles: number;
  totalRaffles: number;
}

export interface AnalyticsData {
  range: AnalyticsRange;
  generatedAt: string;
  kpis: AnalyticsKpis;
  daily: DailyPoint[];
  byRaffle: RaffleRow[];
}

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "7d", label: "Últimos 7 días" },
  { value: "month", label: "Este mes" },
  { value: "all", label: "Histórico" },
];

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  closed: "Cerrado",
  drawn: "Sorteado",
};

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function shortDate(date: string): string {
  // "2026-11-02" → "02/11"
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

export function AdvancedAnalytics({ planLabel }: { planLabel?: string }) {
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
          body.message ?? body.error ?? "No se pudieron cargar las analíticas.",
        );
      }
      setData((await res.json()) as AnalyticsData);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error inesperado al cargar datos.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  const maxRevenue = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.daily.map((d) => d.revenue));
  }, [data]);

  function exportCsv() {
    if (!data) return;

    const label =
      RANGES.find((r) => r.value === data.range)?.label ?? data.range;
    const lines: string[] = [];

    lines.push("Reporte de analiticas;Gadu Sorteos");
    lines.push(`Rango;${label}`);
    lines.push(
      `Generado;${new Date(data.generatedAt).toLocaleString("es-AR")}`,
    );
    lines.push("");
    lines.push("KPI;Valor");
    lines.push(`Recaudacion;${data.kpis.revenue}`);
    lines.push(`Pagos aprobados;${data.kpis.approvedPayments}`);
    lines.push(`Pagos totales;${data.kpis.totalPayments}`);
    lines.push(`Ticket promedio;${data.kpis.avgTicket.toFixed(2)}`);
    lines.push(`Conversion;${(data.kpis.conversion * 100).toFixed(2)}%`);
    lines.push(`Numeros vendidos;${data.kpis.sold}`);
    lines.push(`Numeros reservados;${data.kpis.reserved}`);
    lines.push(`Sorteos activos;${data.kpis.activeRaffles}`);
    lines.push(`Sorteos totales;${data.kpis.totalRaffles}`);
    lines.push("");
    lines.push("Fecha;Recaudacion;Pagos aprobados");
    data.daily.forEach((d) => {
      lines.push(`${d.date};${d.revenue};${d.payments}`);
    });
    lines.push("");
    lines.push("Sorteo;Estado;Recaudacion;Pagos aprobados");
    data.byRaffle.forEach((r) => {
      const title = `"${r.title.replace(/"/g, '""')}"`;
      lines.push(`${title};${r.status};${r.revenue};${r.payments}`);
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
                  ? "bg-amber-500 text-white"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {r.label}
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
            aria-label="Actualizar analíticas"
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
            Exportar CSV
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
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <Coins className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm text-muted-foreground">
                Recaudación
              </p>
              <p className="truncate text-xl font-bold">
                {loading || !kpis ? "—" : formatPrice(kpis.revenue)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
              <Ticket className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm text-muted-foreground">
                Pagos aprobados
              </p>
              <p className="truncate text-xl font-bold">
                {loading || !kpis ? "—" : kpis.approvedPayments}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white">
              <BarChart3 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm text-muted-foreground">
                Ticket promedio
              </p>
              <p className="truncate text-xl font-bold">
                {loading || !kpis ? "—" : formatPrice(kpis.avgTicket)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white">
              <Percent className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm text-muted-foreground">
                Tasa de aprobación
              </p>
              <p className="truncate text-xl font-bold">
                {loading || !kpis ? "—" : pct(kpis.conversion)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de tendencia */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Recaudación por día</p>
            <p className="text-xs text-muted-foreground">
              {data?.daily.length ?? 0} día(s)
            </p>
          </div>

          {loading && !data ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : (
            <div className="flex h-40 items-end gap-1">
              {(data?.daily ?? []).map((d) => {
                const height = Math.max(2, (d.revenue / maxRevenue) * 100);
                return (
                  <div
                    key={d.date}
                    className="group relative flex flex-1 flex-col items-center justify-end"
                  >
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-amber-600 to-amber-400 transition-all hover:from-amber-500 hover:to-amber-300"
                      style={{ height: `${height}%` }}
                      title={`${shortDate(d.date)}: ${formatPrice(
                        d.revenue,
                      )} · ${d.payments} pago(s)`}
                    />
                    <span className="mt-1 hidden text-[10px] text-muted-foreground sm:block">
                      {shortDate(d.date)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalle por sorteo */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between p-4">
            <p className="text-sm font-semibold">Recaudación por sorteo</p>
            <span className="text-xs text-muted-foreground">
              Top {data?.byRaffle.length ?? 0}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Sorteo</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-right">Recaudación</th>
                  <th className="p-3 text-right">Pagos</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byRaffle ?? []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-6 text-center text-muted-foreground"
                    >
                      Sin movimientos en el período.
                    </td>
                  </tr>
                ) : (
                  data?.byRaffle.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="max-w-[16rem] truncate p-3 font-medium">
                        {r.title}
                      </td>
                      <td className="p-3">
                        <Badge variant="secondary">
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        {formatPrice(r.revenue)}
                      </td>
                      <td className="p-3 text-right">{r.payments}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {kpis && (
        <p className="text-xs text-muted-foreground">
          Inventario actual: {kpis.sold} números vendidos · {kpis.reserved}{" "}
          reservados · {kpis.activeRaffles} sorteos activos de{" "}
          {kpis.totalRaffles}.
        </p>
      )}
    </div>
  );
}
