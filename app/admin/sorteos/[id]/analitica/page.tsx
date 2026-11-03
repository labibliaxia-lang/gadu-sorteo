import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Coins,
  Eye,
  Percent,
  Ticket,
  Users,
} from "lucide-react";

import { requireAdminSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS = 14;

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shortDay(key: string): string {
  const [, month, day] = key.split("-");
  return `${day}/${month}`;
}

export default async function RaffleAnalyticsPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await requireAdminSession();
  if (!session) redirect("/login");

  const supabase = createClient();

  const { data: raffle } = await supabase
    .from("raffles")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!raffle) notFound();

  const { data: owns } = await supabase.rpc("owns_raffle", {
    p_raffle_id: params.id,
  });

  if (owns !== true) notFound();

  const [visitsResult, soldCountResult, reservedCountResult, soldResult] =
    await Promise.all([
      supabase
        .from("raffle_visits")
        .select("*", { count: "exact", head: true })
        .eq("raffle_id", params.id),
      supabase
        .from("raffle_numbers")
        .select("*", { count: "exact", head: true })
        .eq("raffle_id", params.id)
        .eq("status", "sold"),
      supabase
        .from("raffle_numbers")
        .select("*", { count: "exact", head: true })
        .eq("raffle_id", params.id)
        .eq("status", "reserved"),
      supabase
        .from("raffle_numbers")
        .select("number, sold_at, sold_to")
        .eq("raffle_id", params.id)
        .eq("status", "sold")
        .order("sold_at", { ascending: true })
        .limit(10000),
    ]);

  const visits = visitsResult.count ?? 0;
  const sold = soldCountResult.count ?? 0;
  const reserved = reservedCountResult.count ?? 0;
  const soldRows = (soldResult.data ?? []) as {
    number: number;
    sold_at: string | null;
    sold_to: string | null;
  }[];

  const price = Number(raffle.price_per_number);
  const revenue = sold * price;
  const buyers = new Set(
    soldRows.map((row) => row.sold_to).filter(Boolean),
  ).size;
  const avgTicket = buyers > 0 ? revenue / buyers : 0;
  const participations = sold + reserved;

  const visitToSale = visits > 0 ? sold / visits : null;
  const participationToSale =
    participations > 0 ? sold / participations : null;

  // Ventas por día (últimos 14 días).
  const today = new Date();
  const days: { key: string; sold: number; revenue: number }[] = [];

  for (let i = DAYS - 1; i >= 0; i -= 1) {
    const date = new Date(today.getTime() - i * DAY_MS);
    days.push({ key: dayKey(date), sold: 0, revenue: 0 });
  }

  const byDay = new Map(days.map((day) => [day.key, day]));

  for (const row of soldRows) {
    if (!row.sold_at) continue;
    const key = dayKey(new Date(row.sold_at));
    const bucket = byDay.get(key);
    if (!bucket) continue;
    bucket.sold += 1;
    bucket.revenue += price;
  }

  const maxDailySold = Math.max(1, ...days.map((day) => day.sold));

  // Distribución por bloques de 100 números.
  const blocks = new Map<number, number>();

  for (const row of soldRows) {
    const block = Math.floor((row.number - 1) / 100) * 100;
    blocks.set(block, (blocks.get(block) ?? 0) + 1);
  }

  const blockRows = Array.from(blocks.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([start, count]) => ({
      label: `${start + 1}–${start + 100}`,
      count,
    }));

  const maxBlock = Math.max(1, ...blockRows.map((row) => row.count));

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/sorteos/${params.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al sorteo
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
            <BarChart3 className="h-4 w-4" /> Analítica del sorteo
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{raffle.title}</h1>
          <p className="text-sm text-muted-foreground">
            Desde el inicio del sorteo hasta hoy. Las visitas se cuentan por
            pestaña de navegador.
          </p>
        </div>
        <Badge variant="secondary">
          {raffle.status === "active"
            ? "Activo"
            : raffle.status === "closed"
              ? "Cerrado"
              : "Sorteado"}
        </Badge>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Eye, label: "Visitas", value: String(visits) },
          { icon: Ticket, label: "Números vendidos", value: String(sold) },
          { icon: Coins, label: "Recaudación", value: formatPrice(revenue) },
          { icon: Users, label: "Compradores", value: String(buyers) },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                <stat.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm text-muted-foreground">
                  {stat.label}
                </p>
                <p className="truncate text-xl font-bold">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Embudo de conversión</p>
            <span className="text-xs text-muted-foreground">
              {visits > 0
                ? "Visitas registradas desde que activamos el tracking"
                : "Todavía no hay visitas registradas"}
            </span>
          </div>

          {[
            { label: "Visitas", value: visits, width: 100 },
            {
              label: "Participaciones (reservas + ventas)",
              value: participations,
              width: visits > 0 ? Math.min(100, (participations / visits) * 100) : 0,
            },
            {
              label: "Ventas confirmadas",
              value: sold,
              width: visits > 0 ? Math.min(100, (sold / visits) * 100) : 0,
            },
          ].map((step) => (
            <div key={step.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{step.label}</span>
                <span className="font-semibold">{step.value}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-600 to-orange-600"
                  style={{ width: `${step.width}%` }}
                />
              </div>
            </div>
          ))}

          <div className="grid gap-3 pt-1 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Visitas → venta</p>
              <p className="text-lg font-bold">
                {visitToSale === null ? "—" : pct(visitToSale)}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                Participaciones → venta
              </p>
              <p className="text-lg font-bold">
                {participationToSale === null
                  ? "—"
                  : pct(participationToSale)}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Ticket promedio</p>
              <p className="text-lg font-bold">{formatPrice(avgTicket)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Números vendidos por día</p>
            <span className="text-xs text-muted-foreground">
              Últimos {DAYS} días
            </span>
          </div>

          <div className="flex h-40 items-end gap-1">
            {days.map((day) => (
              <div
                key={day.key}
                className="group relative flex flex-1 flex-col items-center justify-end"
                title={`${shortDay(day.key)}: ${day.sold} vendido(s) · ${formatPrice(day.revenue)}`}
              >
                <div
                  className="w-full rounded-t bg-gradient-to-t from-amber-600 to-amber-400 transition-all hover:from-amber-500 hover:to-amber-300"
                  style={{
                    height: `${Math.max(2, (day.sold / maxDailySold) * 100)}%`,
                  }}
                />
                <span className="mt-1 hidden text-[10px] text-muted-foreground sm:block">
                  {shortDay(day.key)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm font-semibold">Ventas por bloque de números</p>
            {blockRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay ventas confirmadas.
              </p>
            ) : (
              <div className="space-y-2">
                {blockRows.map((block) => (
                  <div key={block.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {block.label}
                      </span>
                      <span className="font-semibold">{block.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-sky-600"
                        style={{
                          width: `${(block.count / maxBlock) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm font-semibold">Últimas ventas confirmadas</p>
            {soldRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay ventas confirmadas.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {soldRows
                  .slice(-8)
                  .reverse()
                  .map((row) => (
                    <li
                      key={`${row.number}-${row.sold_at}`}
                      className="flex items-center justify-between gap-2 rounded-lg border p-2"
                    >
                      <span className="font-mono font-semibold">
                        Nº {String(row.number).padStart(4, "0")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {row.sold_at ? formatDateTime(row.sold_at) : "—"}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Percent className="h-3.5 w-3.5" /> Las visitas son por render/pestaña,
        no personas únicas. El embudo sirve para comparar tendencia, no como
        conteo exacto de audiencia.
      </p>
    </div>
  );
}
