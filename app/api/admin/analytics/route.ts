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

/** Ventana equivalente anterior para la comparativa (mes a mes, etc.). */
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
    const prevStart = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      1,
    );
    return { from: baMidnightUtc(prevStart), to, label: "mes anterior" };
  }

  return null;
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
      payments: number;
    }[],
  };
}

/**
 * Analíticas avanzadas (solo plan Premium / superadmin).
 * Usa el cliente de sesión (RLS) y acota explícitamente por los sorteos
 * del organizador: nunca usa service_role ni expone datos de terceros.
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
    .select("id, title, status, created_at");

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

  const list = (raffles ?? []) as {
    id: string;
    title: string;
    status: string;
    created_at: string;
  }[];

  const ids = list.map((r) => r.id);

  if (ids.length === 0) {
    return NextResponse.json(emptyPayload(range));
  }

  // 2) Pagos del organizador acotados a SUS sorteos (no confiar solo en RLS).
  let paymentsQuery = supabase
    .from("payments")
    .select("id, raffle_id, amount, status, created_at")
    .in("raffle_id", ids);

  if (from) {
    paymentsQuery = paymentsQuery.gte("created_at", from.toISOString());
  }

  const { data: payments, error: paymentsError } = await paymentsQuery;

  if (paymentsError) {
    return NextResponse.json(
      { error: "No se pudieron leer los pagos" },
      { status: 500 },
    );
  }

  const rows = (payments ?? []) as {
    id: string;
    raffle_id: string;
    amount: number | string;
    status: string;
    created_at: string;
  }[];

  const approved = rows.filter((p) => p.status === "approved");

  // 3) Inventario actual (conteos eficientes).
  const [soldRes, reservedRes] = await Promise.all([
    supabase
      .from("raffle_numbers")
      .select("id", { count: "exact", head: true })
      .in("raffle_id", ids)
      .eq("status", "sold"),
    supabase
      .from("raffle_numbers")
      .select("id", { count: "exact", head: true })
      .in("raffle_id", ids)
      .eq("status", "reserved"),
  ]);

  // 4) Visitas (requiere la migración 0026; si no está, queda null).
  let visits: number | null = null;
  const visitsRes = await supabase
    .from("raffle_visits")
    .select("id", { count: "exact", head: true })
    .in("raffle_id", ids)
    .gte("created_at", (from ?? new Date(0)).toISOString());

  if (!visitsRes.error) {
    visits = visitsRes.count ?? 0;
  }

  const revenue = approved.reduce((sum, p) => sum + Number(p.amount), 0);
  const approvedPayments = approved.length;
  const totalPayments = rows.length;

  // 4) Serie diaria (recaudación y pagos aprobados por día).
  const days = buildDays(range);
  const dailyMap = new Map<string, { revenue: number; payments: number }>();
  days.forEach((date) => dailyMap.set(date, { revenue: 0, payments: 0 }));

  approved.forEach((p) => {
    const key = new Date(p.created_at).toLocaleDateString("en-CA", {
      timeZone: TZ,
    });
    const bucket = dailyMap.get(key);
    if (bucket) {
      bucket.revenue += Number(p.amount);
      bucket.payments += 1;
    }
  });

  const daily = days.map((date) => ({
    date,
    revenue: dailyMap.get(date)?.revenue ?? 0,
    payments: dailyMap.get(date)?.payments ?? 0,
  }));

  // 5) Detalle por sorteo.
  const perRaffle = new Map<string, { revenue: number; payments: number }>();
  approved.forEach((p) => {
    const current = perRaffle.get(p.raffle_id) ?? { revenue: 0, payments: 0 };
    current.revenue += Number(p.amount);
    current.payments += 1;
    perRaffle.set(p.raffle_id, current);
  });

  const byRaffle = list
    .map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      revenue: perRaffle.get(r.id)?.revenue ?? 0,
      payments: perRaffle.get(r.id)?.payments ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 12);

  // 6) Comparativa con el período anterior equivalente (mes a mes, etc.).
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
    const { data: prevPayments, error: prevError } = await supabase
      .from("payments")
      .select("amount, status, created_at")
      .in("raffle_id", ids)
      .gte("created_at", prevWindow.from.toISOString())
      .lt("created_at", prevWindow.to.toISOString());

    if (!prevError) {
      const prevRows = (prevPayments ?? []) as {
        amount: number | string;
        status: string;
      }[];
      const prevApproved = prevRows.filter((p) => p.status === "approved");
      const prevRevenue = prevApproved.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );

      comparison = {
        label: prevWindow.label,
        revenue: prevRevenue,
        approvedPayments: prevApproved.length,
        totalPayments: prevRows.length,
        avgTicket:
          prevApproved.length > 0 ? prevRevenue / prevApproved.length : 0,
        conversion:
          prevRows.length > 0 ? prevApproved.length / prevRows.length : 0,
      };
    }
  }

  return NextResponse.json({
    range,
    generatedAt: new Date().toISOString(),
    kpis: {
      revenue,
      approvedPayments,
      totalPayments,
      avgTicket: approvedPayments > 0 ? revenue / approvedPayments : 0,
      conversion: totalPayments > 0 ? approvedPayments / totalPayments : 0,
      sold: soldRes.count ?? 0,
      reserved: reservedRes.count ?? 0,
      visits,
      visitConversion:
        visits !== null && visits > 0 ? approvedPayments / visits : null,
      activeRaffles: list.filter((r) => r.status === "active").length,
      totalRaffles: list.length,
    },
    comparison,
    daily,
    byRaffle,
  });
}
