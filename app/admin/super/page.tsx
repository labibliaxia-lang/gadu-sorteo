import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Coins,
  Crown,
  FlaskConical,
  MessageCircle,
  Ticket,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleRequestActions } from "@/components/RoleRequestActions";
import { SuperAdminDashboard } from "@/components/SuperAdminDashboard";
import { LicenseCodesPanel } from "@/components/LicenseCodesPanel";
import { PlanPricesPanel } from "@/components/PlanPricesPanel";
import { VerificationActions } from "@/components/VerificationActions";
import { cn, formatDateTime, formatPrice } from "@/lib/utils";
import {
  normalizeParam,
  pickAllowed,
  waLink,
  type AssignableRole,
} from "@/lib/superadmin";
import { listUsers } from "./actions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "pending", label: "Pendientes" },
  { key: "approved", label: "Aprobadas" },
  { key: "rejected", label: "Rechazadas" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const TAB_KEYS = TABS.map((t) => t.key) as TabKey[];

const RANGES = [
  { key: "all", label: "Histórico" },
  { key: "month", label: "Este mes" },
  { key: "week", label: "Últimos 7 días" },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];
const RANGE_KEYS = RANGES.map((r) => r.key) as RangeKey[];

const ACTION_LABELS: Record<string, string> = {
  APPROVE_ROLE: "Aprobó rol de organizador",
  REJECT_ROLE: "Rechazó solicitud de rol",
  CHANGE_ROLE: "Cambió rol manualmente",
  CREATE_ORGANIZER: "Alta manual de organizador",
  INVITE_ORGANIZER: "Invitó organizador por email",
  SUSPEND_USER: "Suspendió organizador",
  BLOCK_USER: "Bloqueó usuario",
  DELETE_USER: "Eliminó usuario",
  GENERATE_LICENSE: "Generó código de licencia",
  REVOKE_LICENSE: "Anuló código de licencia",
  REVOKE_LICENSE_BENEFIT: "Quitó el beneficio de una licencia",
  UPDATE_PLAN_PRICE: "Actualizó precio de plan",
  BAN_USER: "Suspendió una cuenta",
  UNBAN_USER: "Levantó una suspensión",
  SUPPORT_VIEW: "Abrió una vista de soporte",
  PLAN_PAYMENT: "Registró un pago de plan",
  MARK_PAID: "Marcó números como pagados",
  UNDO_MARK_PAID: "Revirtió un pago marcado",
};

const WA_MESSAGE =
  "Hola! Recibí tu solicitud para ser organizador en Gadu Sorteos. Quería charlar comisiones y condiciones.";

/** Filas por llamada al paginar en el fallback de métricas. */
const PAGE = 1000;

interface Metrics {
  revenueTotal: number;
  paymentsRevenue: number;
  paymentsCount: number;
  manualRevenue: number;
  manualCount: number;
  numbersSold: number;
  rafflesActive: number;
  usersTotal: number;
  usersByRole: Record<string, number>;
  /** true si se pudo usar la agregación en base (migración 0025). */
  exact: boolean;
}

/**
 * Inicio del mes en curso en hora de Argentina (UTC-3, sin horario de verano).
 * Con la zona del servidor (UTC en Vercel) el corte se corría hasta 3 horas.
 */
function monthStartIso(): string {
  const now = new Date();
  const shifted = new Date(now.getTime() - 3 * 3600 * 1000);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1, 3, 0, 0),
  ).toISOString();
}

/** Suma paginada: PostgREST corta en 1000 filas, así que hay que recorrerlas. */
async function paginateSum<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  accumulate: (rows: T[]) => void,
): Promise<{ ok: boolean; error?: string; rows: number }> {
  let from = 0;
  let rows = 0;

  for (let guard = 0; guard < 200; guard += 1) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) return { ok: false, error: error.message, rows };
    const page = data ?? [];
    accumulate(page);
    rows += page.length;
    if (page.length < PAGE) return { ok: true, rows };
    from += PAGE;
  }

  return {
    ok: false,
    error: "Hay demasiados registros para calcular la métrica completa",
    rows,
  };
}

async function loadMetrics(
  supabase: ReturnType<typeof createClient>,
  admin: ReturnType<typeof createAdminClient>,
  startIso: string | null,
): Promise<{ metrics: Metrics; warning: string | null }> {
  // 1) Agregación en base (una sola llamada, exacta y sin tope de filas).
  const { data: rpc, error: rpcError } = await supabase.rpc(
    "superadmin_metrics",
    { p_from: startIso },
  );

  if (!rpcError && rpc) {
    const m = rpc as Record<string, unknown>;
    const num = (key: string) =>
      Number(m[key] ?? 0) || 0;
    return {
      metrics: {
        revenueTotal: num("revenue_total"),
        paymentsRevenue: num("payments_revenue"),
        paymentsCount: num("payments_count"),
        manualRevenue: num("manual_revenue"),
        manualCount: num("manual_count"),
        numbersSold: num("numbers_sold"),
        rafflesActive: num("raffles_active"),
        usersTotal: num("users_total"),
        usersByRole: (m.users_by_role ?? {}) as Record<string, number>,
        exact: true,
      },
      warning: null,
    };
  }

  // 2) Fallback por si la migración 0025 todavía no está aplicada.
  const metrics: Metrics = {
    revenueTotal: 0,
    paymentsRevenue: 0,
    paymentsCount: 0,
    manualRevenue: 0,
    manualCount: 0,
    numbersSold: 0,
    rafflesActive: 0,
    usersTotal: 0,
    usersByRole: {},
    exact: false,
  };
  const problems: string[] = [];

  const payments = await paginateSum<{ amount: number | string }>(
    (from, to) => {
      let q = admin
        .from("payments")
        .select("amount")
        .eq("status", "approved")
        .order("id");
      if (startIso) q = q.gte("created_at", startIso);
      return q.range(from, to);
    },
    (rows) => {
      for (const row of rows) {
        metrics.paymentsRevenue += Number(row.amount) || 0;
        metrics.paymentsCount += 1;
      }
    },
  );
  if (!payments.ok && payments.error) problems.push(`recaudación: ${payments.error}`);

  const { data: raffles } = await admin
    .from("raffles")
    .select("id, price_per_number");
  const priceById = new Map<string, number>(
    (raffles ?? []).map((r: { id: string; price_per_number: number }) => [
      r.id,
      Number(r.price_per_number) || 0,
    ]),
  );

  const manual = await paginateSum<{ raffle_id: string }>(
    (from, to) => {
      let q = admin
        .from("raffle_numbers")
        .select("raffle_id")
        .eq("status", "sold")
        .is("payment_id", null)
        .order("id");
      if (startIso) q = q.gte("sold_at", startIso);
      return q.range(from, to);
    },
    (rows) => {
      for (const row of rows) {
        metrics.manualRevenue += priceById.get(row.raffle_id) ?? 0;
        metrics.manualCount += 1;
      }
    },
  );
  if (!manual.ok && manual.error) problems.push(`ventas manuales: ${manual.error}`);

  let soldQuery = admin
    .from("raffle_numbers")
    .select("*", { count: "exact", head: true })
    .eq("status", "sold");
  if (startIso) soldQuery = soldQuery.gte("sold_at", startIso);
  const { count: soldCount } = await soldQuery;

  const { count: activeCount } = await admin
    .from("raffles")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  const { count: usersCount } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true });

  metrics.numbersSold = soldCount ?? 0;
  metrics.rafflesActive = activeCount ?? 0;
  metrics.usersTotal = usersCount ?? 0;
  metrics.revenueTotal = metrics.paymentsRevenue + metrics.manualRevenue;

  return {
    metrics,
    warning:
      problems.length > 0
        ? `Métricas calculadas en modo compatible (${problems.join("; ")}).`
        : "Métricas calculadas en modo compatible: aplicá la migración 0025 para que sean exactas.",
  };
}

export default async function SuperAdminPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "superadmin") redirect("/");

  const range = pickAllowed<RangeKey>(
    normalizeParam(searchParams.range),
    RANGE_KEYS,
    "all",
  );
  const tab = pickAllowed<TabKey>(
    normalizeParam(searchParams.tab),
    TAB_KEYS,
    "pending",
  );
  const usersQuery = normalizeParam(searchParams.uq) ?? "";
  const usersPage = Math.max(1, Number(normalizeParam(searchParams.upage) ?? 1) || 1);
  const usersRole = pickAllowed<AssignableRole | "all">(
    normalizeParam(searchParams.urole),
    ["all", "user", "admin", "superadmin"] as const,
    "all",
  );

  const startIso =
    range === "week"
      ? new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
      : range === "month"
        ? monthStartIso()
        : null;

  const rangeLabel =
    RANGES.find((r) => r.key === range)?.label ?? "Histórico";

  const admin = createAdminClient();
  const issues: string[] = [];

  const { metrics, warning: metricsWarning } = await loadMetrics(
    supabase,
    admin,
    startIso,
  );
  if (metricsWarning && !metrics.exact) issues.push(metricsWarning);

  // --- Solicitudes: contadores por pestaña + listado de la pestaña activa ---
  const countRequests = async (status: TabKey): Promise<number> => {
    let q = admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("admin_request_status", status);
    // El contador de "Aprobadas" debe cuadrar con el listado, que sólo
    // muestra a quienes hoy tienen rol de organizador.
    if (status === "approved") q = q.in("role", ["admin", "superadmin"]);
    const { count, error } = await q;
    if (error) {
      issues.push(`solicitudes (${status}): ${error.message}`);
      return 0;
    }
    return count ?? 0;
  };

  const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
    countRequests("pending"),
    countRequests("approved"),
    countRequests("rejected"),
  ]);
  const tabCounts: Record<TabKey, number> = {
    pending: pendingCount,
    approved: approvedCount,
    rejected: rejectedCount,
  };

  let requestsQuery = admin
    .from("profiles")
    .select("id, full_name, phone, email, request_message, role, created_at")
    .eq("admin_request_status", tab);

  // En "Aprobadas" solo tiene sentido mostrar a quien hoy es organizador.
  if (tab === "approved") {
    requestsQuery = requestsQuery.in("role", ["admin", "superadmin"]);
  }

  // Pendientes en orden de llegada (cola justa); el resto, lo más reciente.
  requestsQuery = requestsQuery.order("created_at", {
    ascending: tab === "pending",
  });

  const { data: requests, error: requestsError } = await requestsQuery;
  if (requestsError) issues.push(`solicitudes: ${requestsError.message}`);

  // --- Usuarios: página inicial (la búsqueda vive en el servidor) ---
  const usersResult = await listUsers({
    q: usersQuery,
    page: usersPage,
    role: usersRole === "all" ? undefined : usersRole,
  });
  if (!usersResult.ok && usersResult.error) {
    issues.push(`usuarios: ${usersResult.error}`);
  }

  // --- Códigos de licencia recientes ---
  const { data: licenseCodes, error: licenseError } = await admin
    .from("license_codes")
    .select("code, plan, status, created_at, redeemed_at")
    .order("created_at", { ascending: false })
    .limit(12);
  if (licenseError) issues.push(`licencias: ${licenseError.message}`);

  // --- Precios de los planes (los edita el superadmin) ---
  const { data: planPrices, error: planPricesError } = await admin
    .from("plan_prices")
    .select("plan, price_ars")
    .order("plan", { ascending: true });
  if (planPricesError) issues.push(`precios: ${planPricesError.message}`);

  // --- Registro de auditoría ---
  const { data: logs, error: logsError } = await admin
    .from("admin_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (logsError) issues.push(`auditoría: ${logsError.message}`);

  // --- Verificaciones de identidad pendientes (URLs firmadas temporales) ---
  // Se consultan por separado DNI y selfie: quien sube sólo uno de los dos
  // también tiene que aparecer aquí (antes exigía DNI y quedaba invisible).
  const kycFields = "id, full_name, email, dni_front_url, face_url";
  const [dniKyc, faceKyc] = await Promise.all([
    admin
      .from("profiles")
      .select(kycFields)
      .eq("verification_status", "pending")
      .not("dni_front_url", "is", null)
      .limit(20),
    admin
      .from("profiles")
      .select(kycFields)
      .eq("verification_status", "pending")
      .not("face_url", "is", null)
      .limit(20),
  ]);

  if (dniKyc.error) issues.push(`verificaciones (DNI): ${dniKyc.error.message}`);
  if (faceKyc.error)
    issues.push(`verificaciones (selfie): ${faceKyc.error.message}`);

  const kycById = new Map<string, any>();
  for (const row of [...(dniKyc.data ?? []), ...(faceKyc.data ?? [])]) {
    kycById.set(row.id, row);
  }
  const pendingKyc = Array.from(kycById.values()).slice(0, 20);

  const pendingVerifications = await Promise.all(
    pendingKyc.map(async (p: any) => {
      const sign = async (path: string | null) => {
        if (!path) return null;
        const { data } = await admin.storage
          .from("organizer-kyc")
          .createSignedUrl(path, 3600);
        return data?.signedUrl ?? null;
      };
      return {
        ...p,
        dniUrl: await sign(p.dni_front_url),
        faceUrl: await sign(p.face_url),
      };
    }),
  );

  function qs(next: {
    range?: RangeKey;
    tab?: TabKey;
    uq?: string;
    urole?: string;
    upage?: number;
  }): string {
    const r = next.range ?? range;
    const t = next.tab ?? tab;
    const sp = new URLSearchParams();
    if (r !== "all") sp.set("range", r);
    if (t !== "pending") sp.set("tab", t);
    if (next.uq) sp.set("uq", next.uq);
    if (next.urole && next.urole !== "all") sp.set("urole", next.urole);
    if (next.upage && next.upage > 1) sp.set("upage", String(next.upage));
    const s = sp.toString();
    return s ? `?${s}` : "";
  }

  const stats = [
    {
      icon: Coins,
      label: `Recaudación · ${rangeLabel}`,
      value: formatPrice(metrics.revenueTotal),
      hint: `${formatPrice(metrics.paymentsRevenue)} por Mercado Pago · ${formatPrice(
        metrics.manualRevenue,
      )} manual`,
    },
    {
      icon: Ticket,
      label: `Números vendidos · ${rangeLabel}`,
      value: String(metrics.numbersSold),
      hint: `${metrics.manualCount} por venta manual`,
    },
    {
      icon: Wrench,
      label: "Sorteos activos",
      value: String(metrics.rafflesActive),
      hint: "En toda la plataforma",
    },
    {
      icon: Users,
      label: "Usuarios registrados",
      value: String(metrics.usersTotal),
      hint: `${metrics.usersByRole.admin ?? 0} organizadores · ${
        metrics.usersByRole.superadmin ?? 0
      } superadmin`,
    },
  ];

  const secondary = [
    {
      icon: TrendingUp,
      label: `Pagos aprobados · ${rangeLabel}`,
      value: String(metrics.paymentsCount),
    },
    {
      icon: Crown,
      label: "Ticket promedio (MP)",
      value:
        metrics.paymentsCount > 0
          ? formatPrice(metrics.paymentsRevenue / metrics.paymentsCount)
          : "—",
    },
    {
      icon: MessageCircle,
      label: "Solicitudes pendientes",
      value: String(pendingCount),
    },
    {
      icon: Coins,
      label: "Ventas manuales (importe)",
      value: formatPrice(metrics.manualRevenue),
    },
  ];

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Superadministrador</h1>
        <p className="text-sm text-muted-foreground">
          Consola de control: métricas globales, solicitudes de rol y usuarios.
        </p>
        <Link
          href="/admin/super/sandbox"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <FlaskConical className="mr-1.5 h-4 w-4" />
          Simulador de sorteo
        </Link>
      </header>

      {issues.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">Hay datos que no se pudieron leer</p>
            <ul className="list-inside list-disc text-xs">
              {issues.map((issue, index) => (
                <li key={`${index}-${issue}`}>{issue}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Filtro de rango */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          Período:
        </span>
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={qs({ range: r.key })}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition",
              range === r.key
                ? "bg-amber-500 text-white"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {/* KPIs principales */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                <s.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm text-muted-foreground">
                  {s.label}
                </p>
                <p className="truncate text-xl font-bold">{s.value}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.hint}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* KPIs secundarios */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {secondary.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-2 rounded-lg border px-3 py-2"
          >
            <s.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">{s.label}</p>
              <p className="truncate text-sm font-semibold">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Solicitudes con pestañas */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Solicitudes de rol</h2>

        <div className="flex flex-wrap gap-2 border-b pb-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={qs({ tab: t.key })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-t-md px-3 py-2 text-sm font-medium transition",
                tab === t.key
                  ? "border-b-2 border-amber-500 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  tab === t.key
                    ? "bg-amber-500 text-white"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {tabCounts[t.key]}
              </span>
            </Link>
          ))}
        </div>

        {!requests || requests.length === 0 ? (
          <Card className="border-dashed text-center">
            <CardContent className="py-12 text-muted-foreground">
              No hay solicitudes en esta categoría.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((r: any) => {
              const link = waLink(r.phone, WA_MESSAGE);
              return (
                <Card key={r.id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{r.full_name || "Sin nombre"}</p>
                        <Badge variant="secondary">
                          {r.role === "superadmin"
                            ? "Superadmin"
                            : r.role === "admin"
                              ? "Organizador"
                              : "Usuario"}
                        </Badge>
                      </div>
                      {r.email && (
                        <p className="break-all text-xs text-muted-foreground">
                          {r.email}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {r.phone || "Sin teléfono"}
                      </p>
                      {r.request_message ? (
                        <p className="mt-1 whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 text-xs">
                          💬 {r.request_message}
                        </p>
                      ) : (
                        <p className="text-xs italic text-muted-foreground">
                          Sin mensaje: no dejó propuesta ni contacto escrito.
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        Alta del usuario: {formatDateTime(r.created_at)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                          })}
                        >
                          <MessageCircle className="mr-1.5 h-4 w-4 text-emerald-600" />
                          WhatsApp
                        </a>
                      )}
                      {tab === "pending" ? (
                        <RoleRequestActions userId={r.id} />
                      ) : (
                        <Badge
                          variant={tab === "approved" ? "success" : "destructive"}
                        >
                          {tab === "approved" ? "Aprobada" : "Rechazada"}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Verificaciones de identidad */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Verificaciones de identidad</h2>
        {pendingVerifications.length === 0 ? (
          <Card className="border-dashed text-center">
            <CardContent className="py-12 text-muted-foreground">
              No hay verificaciones pendientes.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pendingVerifications.map((p) => (
              <Card key={p.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold">
                        {p.full_name || "Sin nombre"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.email || p.id}
                      </p>
                    </div>
                    <VerificationActions userId={p.id} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        DNI (frente)
                      </p>
                      {p.dniUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.dniUrl}
                          alt="DNI frente"
                          className="aspect-[16/10] w-full rounded-lg border object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[16/10] items-center justify-center rounded-lg border text-sm text-muted-foreground">
                          Sin DNI
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Selfie
                      </p>
                      {p.faceUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.faceUrl}
                          alt="Selfie"
                          className="aspect-[16/10] w-full rounded-lg border object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[16/10] items-center justify-center rounded-lg border text-sm text-muted-foreground">
                          Sin selfie
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Precios de los planes */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Precios de los planes</h2>
          <span className="text-sm text-muted-foreground">
            /planes · mensual
          </span>
        </div>
        <PlanPricesPanel prices={planPrices ?? []} />
      </div>

      {/* Códigos de licencia */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Códigos de licencia</h2>
          <span className="text-sm text-muted-foreground">
            {licenseCodes?.length ?? 0} recientes
          </span>
        </div>
        <LicenseCodesPanel codes={licenseCodes ?? []} />
      </div>

      {/* Gestión de usuarios */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Usuarios</h2>
          <span className="text-sm text-muted-foreground">
            {metrics.usersTotal} registrados
          </span>
        </div>
        <SuperAdminDashboard
          initialUsers={usersResult.users}
          initialTotal={usersResult.total}
          initialPage={usersResult.page}
          pageSize={usersResult.pageSize}
          initialQuery={usersQuery}
          initialRole={usersRole}
          counts={usersResult.counts}
        />
      </div>

      {/* Auditoría */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Actividad / Auditoría</h2>
        {!logs || logs.length === 0 ? (
          <Card className="border-dashed text-center">
            <CardContent className="py-12 text-muted-foreground">
              Sin actividad registrada.
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Superadmin</th>
                  <th className="p-3">Acción</th>
                  <th className="p-3">Usuario afectado</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l: any) => (
                  <tr key={l.id} className="border-t">
                    <td className="whitespace-nowrap p-3 text-muted-foreground">
                      {formatDateTime(l.created_at)}
                    </td>
                    <td className="p-3">{l.admin_email || l.admin_id}</td>
                    <td className="p-3">
                      <Badge variant="secondary">
                        {ACTION_LABELS[l.action] ?? l.action}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {l.target_email || l.target_user_id || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
