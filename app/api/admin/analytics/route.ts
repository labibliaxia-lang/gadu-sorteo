import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { canViewAnalytics, getPlanContext } from "@/lib/plans";

export const dynamic = "force-dynamic";

const TZ = "America/Argentina/Buenos_Aires";

type Range = "today" | "7d" | "month" | "all";
const RANGES: Range[] = ["today", "7d", "month", "all"];

/** Fecha/hora actual "naive" en la zona horaria de Argentina. */
function baToday(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}

function baDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Medianoche de Argentina (UTC-3, sin DST) convertida a instante UTC. */
function baMidnightUtc(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + 3 * 60 * 60 * 1000);
}

function rangeStart(range: Range): Date | null {
  const today = baToday();

  if (range === "today") return baMidnightUtc(today);

  if (range === "7d") {
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    return baMidnightUtc(d);
  }

  if (range === "month") {
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    return baMidnightUtc(d);
  }

  return null;
}

function buildDays(range: Range): string[] {
  const today = baToday();
  const days: string[] = [];

  if (range === "today") return [baDayKey(today)];

  const back = range === "7d" ? 6 : range === "month" ? today.getDate() - 1 : 29;

  for (let i = back; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(baDayKey(d));
  }

  return days;
}

function previousWindow(
  range: Range,
  from: Date | null,
): { from: Date; to: Date; label: string } | null {
  if (!from) return null;

  const to = new Date(from);

  if (range === "today") {
    return {
      from: new Date(from.getTime() - 24 * 60 * 60 * 1000),
      to,
      label: "día anterior",
    };
  }

  if (range === "7d") {
    return {
      from: new Date(from.getTime() - 7 * 24 * 60 * 60 * 1000),
      to,
      label: "7 días previos",
    };
  }

  if (range === "month") {
    const today = baToday();
    const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { from: baMidnightUtc(prevStart), to, label: "mes anterior" };
  }

  return null;
}

interface RaffleRow {
  id: string;
  title: string;
  status: string;
  price_per_number: number | string;
  created_at: string;
}

function emptyPayload(range: Range) {
  return {
    range,
    generatedAt: new Date().toISOString(),
    kpis: {
      revenue: 0,
      approvedPayments: 0,
      totalPayments: 0,
      avgTicket: 0,
      conversion: 0,
      sold: 0,
      reserved: 0,
      visits: null as number | null,
      visitConversion: null as number | null,
      activeRaffles: 0,
      totalRaffles: 0,
    },
    comparison: null as {
      label: string;
      revenue: number;
      approvedPayments: number;
      totalPayments: number;
      avgTicket: number;
      conversion: number;
    } | null,
    daily: buildDays(range).map((date) => ({ date, revenue: 0, payments: 0 })),
    byRaffle: [] as {
      id: string;
      title: string;
      status: string;
      revenue: number;
      sold: number;
      reserved: number;
      visits: number | null;
      conversion: number;
      visitConversion: number | null;
    }[],
  };
}

/**
 * Analíticas avanzadas (solo plan Premium / superadmin).
 *
 * La fuente de ventas son los números en estado `sold` (prepago manual y MP),
 * no la tabla `payments`: el prepago por transferencia no crea filas ahí.
 * RLS + scope explícito por `created_by`; nunca service_role.
 */
export async function GET(request: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, plan")
    .eq("id", user.id)
    .single();

  const context = getPlanContext(profile);

  if (context.role !== "admin" && !context.isSuperadmin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  if (!canViewAnalytics(context)) {
    return NextResponse.json(
      {
        error: "premium_required",
        message: "Las analíticas avanzadas requieren el plan Premium.",
      },
      { status: 403 },
    );
  }

  const rawRange = request.nextUrl.searchParams.get("range");
  const range: Range =
    rawRange && RANGES.includes(rawRange as Range) ? (rawRange as Range) : "7d";

  const from = rangeStart(range);

  // 1) Sorteos visibles para el usuario (RLS + scope explícito).
  let rafflesQuery = supabase
    .from("raffles")
    .select("id, title, status, created_at, price_per_number")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!context.isSuperadmin) {
    rafflesQuery = rafflesQuery.eq("created_by", user.id);
  }

  const { data: raffles, error: rafflesError } = await rafflesQuery;

  if (rafflesError) {
    return NextResponse.json(
      { error: "No se pudieron leer los sorteos" },
      { status: 500 },
    );
  }

  const list = (raffles ?? []) as RaffleRow[];
  const ids = list.map((r) => r.id);

  if (ids.length === 0) {
    return NextResponse.json(emptyPayload(range));
  }

  const priceById = new Map(
    list.map((r) => [r.id, Number(r.price_per_number) || 0]),
  );

  // 2) Conteos por sorteo: vendidos, reservados y visitas del período.
  const perRaffle = await Promise.all(
    ids.map(async (id) => {
      const [soldRes, reservedRes, visitsRes] = await Promise.all([
        supabase
          .from("raffle_numbers")
          .select("id", { count: "exact", head: true })
          .eq("raffle_id", id)
          .eq("status", "sold"),
        supabase
          .from("raffle_numbers")
          .select("id", { count: "exact", head: true })
          .eq("raffle_id", id)
          .eq("status", "reserved"),
        supabase
          .from("raffle_visits")
          .select("id", { count: "exact", head: true })
          .eq("raffle_id", id)
          .gte("created_at", (from ?? new Date(0)).toISOString()),
      ]);

      return {
        id,
        sold: soldRes.count ?? 0,
        reserved: reservedRes.count ?? 0,
        visits: visitsRes.error ? null : (visitsRes.count ?? 0),
      };
    }),
  );

  const soldById = new Map(perRaffle.map((r) => [r.id, r.sold]));
  const reservedById = new Map(perRaffle.map((r) => [r.id, r.reserved]));
  const visitsById = new Map(perRaffle.map((r) => [r.id, r.visits]));
  const visitsOk = perRaffle.every((r) => r.visits !== null);

  const sold = perRaffle.reduce((sum, r) => sum + r.sold, 0);
  const reserved = perRaffle.reduce((sum, r) => sum + r.reserved, 0);
  const visits = visitsOk
    ? perRaffle.reduce((sum, r) => sum + (r.visits ?? 0), 0)
    : null;

  const revenue = list.reduce(
    (sum, r) => sum + (soldById.get(r.id) ?? 0) * (priceById.get(r.id) ?? 0),
    0,
  );

  // 3) Ventas por día (para la serie y comparativa).
  const soldQuery = supabase
    .from("raffle_numbers")
    .select("raffle_id, sold_at")
    .in("raffle_id", ids)
    .eq("status", "sold")
    .gte("sold_at", (from ?? new Date(0)).toISOString())
    .limit(10000);

  const { data: soldRows, error: soldError } = await soldQuery;

  if (soldError) {
    return NextResponse.json(
      { error: "No se pudieron leer las ventas" },
      { status: 500 },
    );
  }

  const days = buildDays(range);
  const dailyMap = new Map<string, { revenue: number; payments: number }>();
  days.forEach((date) => dailyMap.set(date, { revenue: 0, payments: 0 }));

  for (const row of (soldRows ?? []) as { raffle_id: string; sold_at: string }[]) {
    if (!row.sold_at) continue;
    const key = new Date(row.sold_at).toLocaleDateString("en-CA", {
      timeZone: TZ,
    });
    const bucket = dailyMap.get(key);
    if (!bucket) continue;
    bucket.revenue += priceById.get(row.raffle_id) ?? 0;
    bucket.payments += 1;
  }

  const daily = days.map((date) => ({
    date,
    revenue: dailyMap.get(date)?.revenue ?? 0,
    payments: dailyMap.get(date)?.payments ?? 0,
  }));

  // 4) Detalle por sorteo con conversión.
  const byRaffle = list
    .map((r) => {
      const soldCount = soldById.get(r.id) ?? 0;
      const reservedCount = reservedById.get(r.id) ?? 0;
      const raffleVisits = visitsById.get(r.id) ?? null;
      const participations = soldCount + reservedCount;

      return {
        id: r.id,
        title: r.title,
        status: r.status,
        revenue: soldCount * (priceById.get(r.id) ?? 0),
        sold: soldCount,
        reserved: reservedCount,
        visits: raffleVisits,
        conversion: participations > 0 ? soldCount / participations : 0,
        visitConversion:
          raffleVisits !== null && raffleVisits > 0
            ? soldCount / raffleVisits
            : null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);

  // 5) Comparativa con la ventana anterior (misma definición de ventas).
  let comparison: {
    label: string;
    revenue: number;
    approvedPayments: number;
    totalPayments: number;
    avgTicket: number;
    conversion: number;
  } | null = null;

  const prevWindow = previousWindow(range, from);

  if (prevWindow) {
    const [prevSoldRes, prevVisitsRes] = await Promise.all([
      supabase
        .from("raffle_numbers")
        .select("raffle_id")
        .in("raffle_id", ids)
        .eq("status", "sold")
        .gte("sold_at", prevWindow.from.toISOString())
        .lt("sold_at", prevWindow.to.toISOString())
        .limit(10000),
      supabase
        .from("raffle_visits")
        .select("id", { count: "exact", head: true })
        .in("raffle_id", ids)
        .gte("created_at", prevWindow.from.toISOString())
        .lt("created_at", prevWindow.to.toISOString()),
    ]);

    if (!prevSoldRes.error && !prevVisitsRes.error) {
      const prevRows = (prevSoldRes.data ?? []) as { raffle_id: string }[];
      const prevRevenue = prevRows.reduce(
        (sum, row) => sum + (priceById.get(row.raffle_id) ?? 0),
        0,
      );
      const prevSold = prevRows.length;
      const prevVisits = prevVisitsRes.count ?? 0;

      comparison = {
        label: prevWindow.label,
        revenue: prevRevenue,
        approvedPayments: prevSold,
        totalPayments: prevSold,
        avgTicket: prevSold > 0 ? prevRevenue / prevSold : 0,
        conversion: prevVisits > 0 ? prevSold / prevVisits : 0,
      };
    }
  }

  const participations = sold + reserved;
  const visitConversion =
    visits !== null && visits > 0 ? sold / visits : null;
  const conversion = visitConversion ?? 0;

  return NextResponse.json({
    range,
    generatedAt: new Date().toISOString(),
    kpis: {
      revenue,
      approvedPayments: sold,
      totalPayments: participations,
      avgTicket: sold > 0 ? revenue / sold : 0,
      conversion,
      sold,
      reserved,
      visits,
      visitConversion,
      activeRaffles: list.filter((r) => r.status === "active").length,
      totalRaffles: list.length,
    },
    comparison,
    daily,
    byRaffle,
  });
}
