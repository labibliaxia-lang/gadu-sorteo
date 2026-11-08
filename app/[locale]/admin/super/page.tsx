import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Coins,
  Crown,
  Eye,
  Flag,
  FlaskConical,
  Gift,
  LayoutDashboard,
  MessageCircle,
  ScrollText,
  Settings2,
  ShieldCheck,
  Ticket,
  TrendingUp,
  UserX,
  Users,
  Wrench,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { RoleRequestActions } from "@/components/RoleRequestActions";
import { SuperAdminDashboard } from "@/components/SuperAdminDashboard";
import { LicenseCodesPanel } from "@/components/LicenseCodesPanel";
import { PlanPricesPanel } from "@/components/PlanPricesPanel";
import { VerificationActions } from "@/components/VerificationActions";
import { addressMatches, composeDeliveryAddress } from "@/lib/address";
import { TrafficChart } from "@/components/admin/TrafficChart";
import {
  MetricBarChart,
  type MetricBarPoint,
} from "@/components/admin/MetricBarChart";
import { ReportActions } from "@/components/admin/ReportActions";
import { FeatureRaffleButton } from "@/components/admin/FeatureRaffleButton";
import { Link as LocaleLink } from "@/src/i18n/navigation";
import { cn, formatDateTime, formatPrice } from "@/lib/utils";
import { buildDailySeries, type TrafficPoint } from "@/lib/page-views";
import {
  normalizeParam,
  pickAllowed,
  waLink,
  type AssignableRole,
} from "@/lib/superadmin";
import { listUsers, type ListUsersResult } from "./actions";

export const dynamic = "force-dynamic";

/* =====================================================================
   Pestañas de la consola
   ===================================================================== */

const SECTIONS = [
  { key: "dashboard", icon: LayoutDashboard },
  { key: "usuarios", icon: Users },
  { key: "sorteos", icon: Ticket },
  { key: "referidos", icon: Gift },
  { key: "notificaciones", icon: Bell },
  { key: "denuncias", icon: Flag },
  { key: "auditoria", icon: ScrollText },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];
const SECTION_KEYS = SECTIONS.map((s) => s.key) as SectionKey[];

const TABS = [
  { key: "pending" },
  { key: "approved" },
  { key: "rejected" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const TAB_KEYS = TABS.map((t) => t.key) as TabKey[];

const RANGES = [{ key: "all" }, { key: "month" }, { key: "week" }] as const;
type RangeKey = (typeof RANGES)[number]["key"];
const RANGE_KEYS = RANGES.map((r) => r.key) as RangeKey[];

const ACTION_LABELS: Record<string, string> = {
  APPROVE_ROLE: "approveRole",
  REJECT_ROLE: "rejectRole",
  CHANGE_ROLE: "changeRole",
  CREATE_ORGANIZER: "createOrganizer",
  INVITE_ORGANIZER: "inviteOrganizer",
  SUSPEND_USER: "suspendUser",
  BLOCK_USER: "blockUser",
  DELETE_USER: "deleteUser",
  GENERATE_LICENSE: "generateLicense",
  REVOKE_LICENSE: "revokeLicense",
  REVOKE_LICENSE_BENEFIT: "revokeLicenseBenefit",
  UPDATE_PLAN_PRICE: "updatePlanPrice",
  BAN_USER: "banUser",
  UNBAN_USER: "unbanUser",
  SUPPORT_VIEW: "supportView",
  PLAN_PAYMENT: "planPayment",
  MARK_PAID: "markPaid",
  UNDO_MARK_PAID: "undoMarkPaid",
  // Acciones del Modo Editor y de la edición manual de perfil.
  IMPERSONATE_USER: "impersonateUser",
  IMPERSONATE_END: "impersonateEnd",
  EDIT_PROFILE: "editProfile",
  // Acciones sobre denuncias de sorteos (migración 0064).
  REPORT_RESOLVE: "reportResolve",
  REPORT_RAFFLE_PAUSE: "reportRafflePause",
  REPORT_DELETE: "reportDelete",
};

/** Clave de traducción de cada motivo de denuncia (`lib/reports`). */
const REPORT_REASON_KEYS: Record<string, string> = {
  fraude: "fraud",
  premio_falso: "fakePrize",
  contenido_inapropiado: "inappropriate",
  spam: "spam",
  otro: "other",
};

/** Acciones que se pueden elegir en el filtro de auditoría. */
const AUDIT_ACTIONS = Object.keys(ACTION_LABELS);

const RAFFLE_STATUS: Record<
  string,
  {
    labelKey: string;
    variant: "success" | "secondary" | "info" | "destructive" | "warning";
  }
> = {
  active: { labelKey: "active", variant: "success" },
  closed: { labelKey: "closed", variant: "warning" },
  drawn: { labelKey: "drawn", variant: "info" },
  cancelled: { labelKey: "cancelled", variant: "destructive" },
};

/** Ventana del gráfico de tráfico: la misma que acepta la RPC. */
const TRAFFIC_DAYS = 30;

/** Filas por llamada al paginar en el fallback de métricas. */
const PAGE = 1000;

/* =====================================================================
   Tipos de fila
   ===================================================================== */

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

interface RoleRequestRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  request_message: string | null;
  request_tools: string | null;
  request_social: string | null;
  role: string;
  created_at: string;
}

interface PlanPriceRow {
  plan: string;
  price_ars: number | string;
}

interface LicenseCodeRow {
  code: string;
  plan: string;
  status: string;
  created_at: string;
  redeemed_at: string | null;
}

interface RaffleRow {
  id: string;
  title: string;
  status: string;
  price_per_number: number | string;
  draw_date: string | null;
  created_at: string;
  created_by: string | null;
  /** Destacado en la home (migración 0066). */
  is_featured?: boolean | null;
  /** Sorteo exclusivo de premios de referidos (0105). */
  bonus_raffle_id?: string | null;
}

/** Top de referentes para la pestaña Referidos. */
interface ReferidoTopRow {
  referrerId: string;
  nombre: string;
  invitados: number;
  compraron: number;
  premios: number;
}

/** Avisos críticos del superadmin (campana de 0101). */
interface SuperNotificacion {
  id: string;
  type: string;
  title: string | null;
  message: string | null;
  created_at: string;
  raffle_id: string | null;
  read_at: string | null;
}

interface AuditLogRow {
  id: string;
  created_at: string;
  admin_email: string | null;
  admin_id: string | null;
  action: string;
  target_email: string | null;
  target_user_id: string | null;
}

/** Fila cruda de la RPC `superadmin_daily_metrics` (migración 0064). */
interface DailyMetricsRow {
  day: string;
  views: number | string;
  visitors: number | string;
  new_users: number | string;
  revenue: number | string;
}

interface RaffleReportRow {
  id: string;
  raffle_id: string;
  reporter_id: string | null;
  reason: string;
  comment: string | null;
  status: string;
  created_at: string;
}

/** Denuncia ya resuelta contra sorteos y perfiles, lista para renderizar. */
interface ReportCard {
  id: string;
  raffleId: string;
  raffleTitle: string;
  raffleStatus: string;
  reporterEmail: string | null;
  reason: string;
  comment: string | null;
  status: string;
  createdAt: string;
}

function emptyMetrics(): Metrics {
  return {
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
}

/* =====================================================================
   Métricas (lógica heredada, sin cambios de comportamiento)
   ===================================================================== */

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
    const num = (key: string) => Number(m[key] ?? 0) || 0;
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
  const metrics = emptyMetrics();
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
  if (!payments.ok && payments.error)
    problems.push(`recaudación: ${payments.error}`);

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
  if (!manual.ok && manual.error)
    problems.push(`ventas manuales: ${manual.error}`);

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

/* =====================================================================
   Verificaciones de identidad (KYC)
   ===================================================================== */

interface PendingKycRow {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string | null;
  dni_front_url: string | null;
  dni_back_url: string | null;
  face_url: string | null;
  /** Dirección impresa en el DNI y dirección de entrega: se muestran juntas. */
  dni_address: string | null;
  address_line: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
}

type AdminClient = ReturnType<typeof createAdminClient>;

const KYC_SELECT =
  "id, full_name, email, created_at, dni_front_url, dni_back_url, face_url, dni_address, address_line, city, province, postal_code";
const KYC_SELECT_LEGACY =
  "id, full_name, email, created_at, dni_front_url, face_url, dni_address, address_line, city, province, postal_code";
// La solicitud es "revisable" cuando subió al menos una imagen: el valor por
// defecto de verification_status es 'pending' para TODOS los perfiles, así que
// sin este filtro la lista se llenaría de usuarios que nunca pidieron KYC.
const KYC_DOCS_OR =
  "dni_front_url.not.is.null,dni_back_url.not.is.null,face_url.not.is.null";
const KYC_DOCS_OR_LEGACY = "dni_front_url.not.is.null,face_url.not.is.null";

interface PendingKycResult {
  rows: PendingKycRow[];
  /** true si la base todavía no tiene `dni_back_url` (migración 0017 vieja). */
  missingBackColumn: boolean;
  error: string | null;
}

/**
 * Lista las solicitudes KYC pendientes. Si la base quedó atrás y no tiene
 * `dni_back_url`, reintenta sin esa columna para que el panel NO se rompa
 * mientras se aplica la migración 0017; el aviso queda en `issues`.
 */
async function loadPendingKyc(admin: AdminClient): Promise<PendingKycResult> {
  const full = await admin
    .from("profiles")
    .select(KYC_SELECT)
    .eq("verification_status", "pending")
    .or(KYC_DOCS_OR)
    .order("created_at", { ascending: true })
    .limit(20);

  if (!full.error) {
    return {
      rows: (full.data ?? []) as unknown as PendingKycRow[],
      missingBackColumn: false,
      error: null,
    };
  }

  if (full.error.message.toLowerCase().includes("dni_back_url")) {
    const legacy = await admin
      .from("profiles")
      .select(KYC_SELECT_LEGACY)
      .eq("verification_status", "pending")
      .or(KYC_DOCS_OR_LEGACY)
      .order("created_at", { ascending: true })
      .limit(20);

    if (legacy.error) {
      return {
        rows: [],
        missingBackColumn: true,
        error: legacy.error.message,
      };
    }

    const rows = (
      (legacy.data ?? []) as unknown as Omit<PendingKycRow, "dni_back_url">[]
    ).map((row) => ({ ...row, dni_back_url: null }));

    return { rows, missingBackColumn: true, error: null };
  }

  return {
    rows: [],
    missingBackColumn: false,
    error: full.error.message,
  };
}

/** Contador de KYC pendientes con el mismo criterio que la lista. */
async function countPendingKyc(
  admin: AdminClient,
  missingBackColumn: boolean,
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("verification_status", "pending")
    .or(missingBackColumn ? KYC_DOCS_OR_LEGACY : KYC_DOCS_OR);

  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

/**
 * Sólo el contador de KYC (Dashboard). Detecta por sí mismo si falta la
 * columna del dorso y reintenta con el criterio viejo.
 */
async function probeKycPendingCount(
  admin: AdminClient,
): Promise<{ count: number; missingBackColumn: boolean; error: string | null }> {
  const full = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("verification_status", "pending")
    .or(KYC_DOCS_OR);

  if (!full.error) {
    return { count: full.count ?? 0, missingBackColumn: false, error: null };
  }

  if (!full.error.message.toLowerCase().includes("dni_back_url")) {
    return { count: 0, missingBackColumn: false, error: full.error.message };
  }

  const legacy = await countPendingKyc(admin, true);
  return {
    count: legacy.count,
    missingBackColumn: true,
    error: legacy.error,
  };
}

/* =====================================================================
   Métricas diarias (migración 0064). Si la RPC todavía no existe, el panel
   sigue: aviso discreto y gráficos vacíos.
   ===================================================================== */

interface DailyMetrics {
  rows: DailyMetricsRow[];
  note: string | null;
}

async function loadDailyMetrics(
  supabase: ReturnType<typeof createClient>,
): Promise<DailyMetrics> {
  try {
    const { data, error } = await supabase.rpc("superadmin_daily_metrics", {
      p_days: TRAFFIC_DAYS,
    });

    if (error) {
      return {
        rows: [],
        note: "Las métricas diarias todavía no están disponibles: falta aplicar la migración 0064 (tabla page_views y RPC superadmin_daily_metrics). El resto del panel funciona igual.",
      };
    }

    return { rows: (data ?? []) as DailyMetricsRow[], note: null };
  } catch {
    return {
      rows: [],
      note: "No se pudieron consultar las métricas diarias. El resto del panel funciona igual.",
    };
  }
}

function sumDaily(
  rows: readonly DailyMetricsRow[],
  key: "views" | "visitors" | "new_users" | "revenue",
): number {
  return rows.reduce((sum, row) => {
    const value = Number(row[key]);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

/** Serie de gráfico a partir de una columna de la RPC (ya viene por día). */
function dailySeries(
  rows: readonly DailyMetricsRow[],
  key: "new_users" | "revenue",
): MetricBarPoint[] {
  return rows.map((row) => ({
    day: String(row.day),
    value: Number(row[key]) || 0,
  }));
}

/* =====================================================================
   Piezas de la UI
   ===================================================================== */

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand-500/25 bg-brand-500/10 text-brand-accent">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-fg-subtle">
            {label}
          </p>
          <p className="truncate font-mono text-xl font-semibold tabular-nums">
            {value}
          </p>
          <p className="text-xs leading-snug text-fg-subtle">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* =====================================================================
   Página
   ===================================================================== */

type SuperAdminSearchParams = Record<string, string | string[] | undefined>;

/**
 * `redirect()` y `notFound()` no son fallos: Next los implementa lanzando un
 * error con un `digest` interno. Si el try/catch los traga, el redirect deja
 * de funcionar y el panel queda en blanco. Se re-lanzan tal cual.
 */
function esErrorDeControl(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("NEXT_NOT_FOUND") ||
      digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))
  );
}

/** Fallback del panel cuando una consulta del servidor falla de forma inesperada. */
async function SuperAdminFallback() {
  const t = await getTranslations("AdminSuper");
  return (
    <div className="mx-auto max-w-xl py-16" role="alert">
      <Card>
        <CardHeader>
          <CardTitle>{t("error.title")}</CardTitle>
          <CardDescription>{t("error.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LocaleLink href="/admin/super" className={buttonVariants()}>
            {t("error.retry")}
          </LocaleLink>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function SuperAdminPage({
  searchParams,
}: {
  searchParams: SuperAdminSearchParams;
}) {
  try {
    return await SuperAdminPanel({ searchParams });
  } catch (error) {
    // Un redirect/404 tiene que seguir su curso; sólo atrapamos fallas reales.
    if (esErrorDeControl(error)) throw error;
    console.error("[admin/super] no se pudo cargar el panel", error);
    return <SuperAdminFallback />;
  }
}

async function SuperAdminPanel({
  searchParams,
}: {
  searchParams: SuperAdminSearchParams;
}) {
  const t = await getTranslations("AdminSuper");
  const locale = await getLocale();
  const nfmt = new Intl.NumberFormat(locale === "es" ? "es-AR" : locale);
  const inLocale = (path: string) =>
    locale === "es" ? path : `/${locale}${path}`;
  const actionLabel = (action: string) => {
    const key = ACTION_LABELS[action];
    return key ? t(`actions.${key}`) : action;
  };
  const reportReasonLabel = (reason: string) => {
    const key = REPORT_REASON_KEYS[reason];
    return key ? t(`reportReasons.${key}`) : reason;
  };
  const roleLabel = (role: string) =>
    role === "superadmin"
      ? t("roles.superadmin")
      : role === "admin"
        ? t("roles.admin")
        : t("roles.user");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(inLocale("/login"));

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "superadmin") redirect(inLocale("/"));

  const section = pickAllowed<SectionKey>(
    normalizeParam(searchParams.tab),
    SECTION_KEYS,
    "dashboard",
  );
  const requestTab = pickAllowed<TabKey>(
    normalizeParam(searchParams.rtab),
    TAB_KEYS,
    "pending",
  );
  const range = pickAllowed<RangeKey>(
    normalizeParam(searchParams.range),
    RANGE_KEYS,
    "all",
  );
  const usersQuery = normalizeParam(searchParams.uq) ?? "";
  const usersPage = Math.max(
    1,
    Number(normalizeParam(searchParams.upage) ?? 1) || 1,
  );
  const usersRole = pickAllowed<AssignableRole | "all">(
    normalizeParam(searchParams.urole),
    ["all", "user", "admin", "superadmin"] as const,
    "all",
  );
  const rawAction = normalizeParam(searchParams.accion);
  const auditFilter =
    rawAction && AUDIT_ACTIONS.includes(rawAction) ? rawAction : "all";

  const startIso =
    range === "week"
      ? new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
      : range === "month"
        ? monthStartIso()
        : null;

  const rangeLabel = t(`ranges.${range}`);

  const admin = createAdminClient();
  const issues: string[] = [];

  // --- Solicitudes: contadores por pestaña (badge de la pestaña Usuarios) ---
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

  // ===== Datos por pestaña =====
  let metrics = emptyMetrics();
  let mrr: number | null = null;
  let mrrSubscriptions = 0;
  let traffic: TrafficPoint[] = [];
  let dailyRows: DailyMetricsRow[] = [];
  let dailyNote: string | null = null;
  let planPrices: PlanPriceRow[] = [];
  let licenseCodes: LicenseCodeRow[] = [];
  let kycPendingCount = 0;
  let requests: RoleRequestRow[] = [];
  let pendingVerifications: Array<
    PendingKycRow & {
      dniFrontUrl: string | null;
      dniBackUrl: string | null;
      faceUrl: string | null;
    }
  > = [];
  let usersResult: ListUsersResult | null = null;
  let raffles: RaffleRow[] = [];
  let organizerById = new Map<string, string>();
  let reports: ReportCard[] = [];
  let reportsNote: string | null = null;
  let reportsPendingCount: number | null = null;
  let logs: AuditLogRow[] = [];
  let referidosTop: ReferidoTopRow[] = [];
  let referidosExitosos = 0;
  let superNotifs: SuperNotificacion[] = [];
  let bonusDestino = new Map<string, string[]>();
  let premiosDestino = new Map<string, number>();
  let tituloSorteo = new Map<string, string>();

  // Badge de la pestaña Denuncias. Si la migración 0064 todavía no está
  // aplicada, la tabla no existe: no se muestra badge y el panel sigue igual.
  const reportsCountResult = await admin
    .from("raffle_reports")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  reportsPendingCount = reportsCountResult.error
    ? null
    : reportsCountResult.count ?? 0;

  if (section === "dashboard") {
    const loadedMetrics = await loadMetrics(supabase, admin, startIso);
    metrics = loadedMetrics.metrics;
    if (loadedMetrics.warning && !metrics.exact) {
      issues.push(loadedMetrics.warning);
    }

    // Métricas diarias de los últimos 30 días: visitas, altas e ingresos.
    const daily = await loadDailyMetrics(supabase);
    dailyRows = daily.rows;
    dailyNote = daily.note;
    traffic = buildDailySeries(dailyRows, TRAFFIC_DAYS);

    // Precios de los planes (también alimentan el cálculo del MRR).
    const { data: pricesData, error: pricesError } = await admin
      .from("plan_prices")
      .select("plan, price_ars")
      .order("plan", { ascending: true });
    if (pricesError) {
      issues.push(`precios: ${pricesError.message}`);
    } else {
      planPrices = (pricesData ?? []) as PlanPriceRow[];
    }

    // MRR estimado: precio mensual × suscripciones vigentes por plan.
    if (pricesError) {
      issues.push(
        "MRR sin calcular: no se pudieron leer los precios de los planes.",
      );
    } else {
      const { data: activePlans, error: activeError } = await admin
        .from("profiles")
        .select("plan")
        .gt("plan_expires_at", new Date().toISOString())
        .in("plan", ["organizador", "premium"]);

      if (activeError) {
        issues.push(
          `MRR sin calcular: no se pudieron leer las suscripciones (${activeError.message}).`,
        );
      } else {
        const countByPlan: Record<string, number> = {};
        for (const row of activePlans ?? []) {
          const plan = String((row as { plan: string }).plan);
          countByPlan[plan] = (countByPlan[plan] ?? 0) + 1;
          mrrSubscriptions += 1;
        }

        const priceByPlan = new Map<string, number>(
          planPrices.map((price) => [price.plan, Number(price.price_ars) || 0]),
        );
        const missingPlans: string[] = [];
        let total = 0;
        for (const [plan, count] of Object.entries(countByPlan)) {
          const price = priceByPlan.get(plan);
          if (price === undefined) {
            missingPlans.push(plan);
            continue;
          }
          total += price * count;
        }
        mrr = total;
        if (missingPlans.length > 0) {
          issues.push(
            `MRR incompleto: falta el precio mensual de ${missingPlans.join(", ")}.`,
          );
        }
      }
    }

    // Códigos de licencia recientes.
    const { data: licenseData, error: licenseError } = await admin
      .from("license_codes")
      .select("code, plan, status, created_at, redeemed_at")
      .order("created_at", { ascending: false })
      .limit(12);
    if (licenseError) issues.push(`licencias: ${licenseError.message}`);
    else licenseCodes = (licenseData ?? []) as LicenseCodeRow[];

    // KYC pendientes: sólo el contador, para la tarjeta secundaria.
    const kycProbe = await probeKycPendingCount(admin);
    kycPendingCount = kycProbe.count;
    if (kycProbe.error) {
      issues.push(`verificaciones (contador): ${kycProbe.error}`);
    }
    if (kycProbe.missingBackColumn) {
      issues.push(
        "La base todavía no tiene dni_back_url: ejecutá la migración 0017_organizer_verification.sql para revisar el dorso del DNI.",
      );
    }

    // 0102: referidos que efectivamente se premiaron.
    const { count: referidosCount } = await admin
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("rewarded", true);
    referidosExitosos = referidosCount ?? 0;
  }

  if (section === "usuarios") {
    // --- Solicitudes de la pestaña activa ---
    let requestsQuery = admin
      .from("profiles")
      .select("id, full_name, phone, email, request_message, request_tools, request_social, role, created_at")
      .eq("admin_request_status", requestTab);

    // En "Aprobadas" sólo tiene sentido mostrar a quien hoy es organizador.
    if (requestTab === "approved") {
      requestsQuery = requestsQuery.in("role", ["admin", "superadmin"]);
    }

    // Pendientes en orden de llegada (cola justa); el resto, lo más reciente.
    requestsQuery = requestsQuery.order("created_at", {
      ascending: requestTab === "pending",
    });

    const { data: requestRows, error: requestsError } = await requestsQuery;
    if (requestsError) issues.push(`solicitudes: ${requestsError.message}`);
    else requests = (requestRows ?? []) as RoleRequestRow[];

    // --- Verificaciones de identidad pendientes (URLs firmadas temporales) ---
    // Una sola consulta: frente, dorso y selfie. El bucket es privado: se
    // firma cada ruta por 1 hora.
    const pendingKycResult = await loadPendingKyc(admin);
    if (pendingKycResult.error) {
      issues.push(`verificaciones: ${pendingKycResult.error}`);
    }
    if (pendingKycResult.missingBackColumn) {
      issues.push(
        "La base todavía no tiene dni_back_url: ejecutá la migración 0017_organizer_verification.sql para revisar el dorso del DNI.",
      );
    }

    const kycCountResult = await countPendingKyc(
      admin,
      pendingKycResult.missingBackColumn,
    );
    if (kycCountResult.error) {
      issues.push(`verificaciones (contador): ${kycCountResult.error}`);
    }
    kycPendingCount = kycCountResult.count;

    pendingVerifications = await Promise.all(
      pendingKycResult.rows.map(async (row) => {
        const sign = async (path: string | null) => {
          if (!path) return null;
          const { data } = await admin.storage
            .from("organizer-kyc")
            .createSignedUrl(path, 3600);
          return data?.signedUrl ?? null;
        };

        const [dniFrontUrl, dniBackUrl, faceUrl] = await Promise.all([
          sign(row.dni_front_url),
          sign(row.dni_back_url),
          sign(row.face_url),
        ]);

        return { ...row, dniFrontUrl, dniBackUrl, faceUrl };
      }),
    );

    // --- Usuarios: página inicial (la búsqueda vive en el servidor) ---
    usersResult = await listUsers({
      q: usersQuery,
      page: usersPage,
      role: usersRole === "all" ? undefined : usersRole,
    });
    if (!usersResult.ok && usersResult.error) {
      issues.push(`usuarios: ${usersResult.error}`);
    }
  }

  if (section === "sorteos") {
    const { data: rafflesData, error: rafflesError } = await admin
      .from("raffles")
      // `*` para que la sección siga funcionando antes de aplicar 0066
      // (is_featured simplemente no viene y el botón muestra "Destacar").
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (rafflesError) issues.push(`sorteos: ${rafflesError.message}`);
    else raffles = (rafflesData ?? []) as RaffleRow[];

    // Nombre del organizador: una segunda consulta evita depender de un join.
    const creatorIds = Array.from(
      new Set(
        raffles
          .map((raffle) => raffle.created_by)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (creatorIds.length > 0) {
      const { data: organizers, error: organizersError } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", creatorIds);
      if (organizersError) {
        issues.push(`organizadores: ${organizersError.message}`);
      } else {
        organizerById = new Map(
          (organizers ?? []).map(
            (row: {
              id: string;
              full_name: string | null;
              email: string | null;
            }) => [row.id, row.full_name || row.email || "—"],
          ),
        );
      }
    }

    // 0105: `bonus_raffle_id` vive en el principal y apunta al exclusivo.
    // Se muestran los dos lados de la relación en la columna.
    const { data: relaciones } = await admin
      .from("raffles")
      .select("id, title, bonus_raffle_id")
      .not("bonus_raffle_id", "is", null);

    for (const fila of relaciones ?? []) {
      const id = fila.id as string;
      const titulo = (fila.title as string) ?? t("raffles.genericTitle");
      tituloSorteo.set(id, titulo);
      const destino = fila.bonus_raffle_id as string | null;
      if (destino) {
        const lista = bonusDestino.get(destino) ?? [];
        lista.push(titulo);
        bonusDestino.set(destino, lista);
      }
    }

    if (bonusDestino.size > 0) {
      const { data: destinos } = await admin
        .from("raffles")
        .select("id, title")
        .in("id", [...bonusDestino.keys()]);

      for (const fila of destinos ?? []) {
        tituloSorteo.set(
          fila.id as string,
          (fila.title as string) ?? t("raffles.genericTitle"),
        );
      }

      const { data: premios } = await admin
        .from("raffle_numbers")
        .select("raffle_id")
        .eq("origin", "premio")
        .in("raffle_id", [...bonusDestino.keys()]);

      for (const fila of premios ?? []) {
        const id = fila.raffle_id as string;
        premiosDestino.set(id, (premiosDestino.get(id) ?? 0) + 1);
      }
    }
  }

  if (section === "referidos") {
    const { data: filas, error: referidosError } = await admin
      .from("referrals")
      .select("referrer_id, referred_id, rewarded");

    if (referidosError) {
      issues.push(`referidos: ${referidosError.message}`);
    } else {
      const rows = filas ?? [];
      const referrers = [...new Set(rows.map((r) => r.referrer_id as string))];
      const referred = [...new Set(rows.map((r) => r.referred_id as string))];

      const { data: perfiles } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", referrers);

      const nombrePorId = new Map(
        (perfiles ?? []).map((p) => [
          p.id as string,
          (p.full_name as string) || (p.email as string) || "—",
        ]),
      );

      const { data: compras } =
        referred.length > 0
          ? await admin
              .from("raffle_numbers")
              .select("sold_to")
              .eq("status", "sold")
              .in("sold_to", referred)
          : { data: [] as { sold_to: string | null }[] };

      const compraron = new Set(
        (compras ?? []).map((c) => c.sold_to as string),
      );

      const agg = new Map<
        string,
        { invitados: number; compraron: number; premios: number }
      >();

      for (const r of rows) {
        const id = r.referrer_id as string;
        const actual = agg.get(id) ?? { invitados: 0, compraron: 0, premios: 0 };
        actual.invitados += 1;
        if (compraron.has(r.referred_id as string)) actual.compraron += 1;
        if (r.rewarded) actual.premios += 1;
        agg.set(id, actual);
      }

      referidosTop = [...agg.entries()]
        .map(([referrerId, a]) => ({
          referrerId,
          nombre: nombrePorId.get(referrerId) ?? "—",
          ...a,
        }))
        .sort(
          (a, b) => b.compraron - a.compraron || b.invitados - a.invitados,
        )
        .slice(0, 10);
    }
  }

  if (section === "notificaciones") {
    const { data: notis, error: notisError } = await admin
      .from("notifications")
      .select("id, type, title, message, created_at, raffle_id, read_at")
      .eq("user_id", user.id)
      .eq("audience", "superadmin")
      .order("created_at", { ascending: false })
      .limit(50);

    if (notisError) {
      issues.push(`notificaciones: ${notisError.message}`);
    } else {
      superNotifs = (notis ?? []) as SuperNotificacion[];
    }
  }

  if (section === "denuncias") {
    // Sólo las pendientes: las resueltas/descartadas quedan en la auditoría.
    const { data: reportRows, error: reportsError } = await admin
      .from("raffle_reports")
      .select(
        "id, raffle_id, reporter_id, reason, comment, status, created_at",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100);

    if (reportsError) {
      reportsNote =
        "No se pudieron leer las denuncias. Si la migración 0064 todavía no está aplicada, la tabla raffle_reports no existe: el panel sigue funcionando y la lista queda vacía.";
    } else {
      const rawReports = (reportRows ?? []) as RaffleReportRow[];

      // `raffle_reports` no tiene FK a profiles: se resuelven por separado.
      const raffleIds = Array.from(
        new Set(rawReports.map((report) => report.raffle_id)),
      );
      const reporterIds = Array.from(
        new Set(
          rawReports
            .map((report) => report.reporter_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const [rafflesRes, reportersRes] = await Promise.all([
        raffleIds.length > 0
          ? admin
              .from("raffles")
              .select("id, title, status")
              .in("id", raffleIds)
          : Promise.resolve({ data: [], error: null }),
        reporterIds.length > 0
          ? admin
              .from("profiles")
              .select("id, full_name, email")
              .in("id", reporterIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (rafflesRes.error) {
        issues.push(`denuncias (sorteos): ${rafflesRes.error.message}`);
      }
      if (reportersRes.error) {
        issues.push(`denuncias (denunciantes): ${reportersRes.error.message}`);
      }

      const raffleById = new Map<
        string,
        { title: string; status: string }
      >(
        (rafflesRes.data ?? []).map(
          (row: { id: string; title: string | null; status: string }) => [
            row.id,
            { title: row.title || t("raffles.noTitle"), status: row.status },
          ],
        ),
      );
      const reporterById = new Map<string, string | null>(
        (reportersRes.data ?? []).map(
          (row: { id: string; email: string | null }) => [row.id, row.email],
        ),
      );

      reports = rawReports.map((report) => {
        const raffle = raffleById.get(report.raffle_id);
        return {
          id: report.id,
          raffleId: report.raffle_id,
          raffleTitle: raffle ? raffle.title : t("reports.deletedRaffle"),
          raffleStatus: raffle?.status ?? "unknown",
          reporterEmail: report.reporter_id
            ? reporterById.get(report.reporter_id) ?? null
            : null,
          reason: report.reason,
          comment: report.comment,
          status: report.status,
          createdAt: report.created_at,
        };
      });
    }
  }

  if (section === "auditoria") {
    let logsQuery = admin
      .from("admin_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (auditFilter !== "all") logsQuery = logsQuery.eq("action", auditFilter);

    const { data: logsData, error: logsError } = await logsQuery;
    if (logsError) issues.push(`auditoría: ${logsError.message}`);
    else logs = (logsData ?? []) as AuditLogRow[];
  }

  /** Arma los links conservando pestaña y filtros vigentes. */
  function qs(
    next: {
      tab?: SectionKey;
      rtab?: TabKey;
      range?: RangeKey;
      uq?: string;
      urole?: string;
      upage?: number;
      accion?: string;
    } = {},
  ): string {
    const sp = new URLSearchParams();
    const t = next.tab ?? section;
    const rt = next.rtab ?? requestTab;
    const r = next.range ?? range;
    const a = next.accion ?? auditFilter;
    const uq = next.uq ?? usersQuery;
    const ur = next.urole ?? usersRole;
    const up = next.upage ?? usersPage;
    if (t !== "dashboard") sp.set("tab", t);
    if (rt !== "pending") sp.set("rtab", rt);
    if (r !== "all") sp.set("range", r);
    if (a !== "all") sp.set("accion", a);
    if (uq) sp.set("uq", uq);
    if (ur && ur !== "all") sp.set("urole", ur);
    if (up > 1) sp.set("upage", String(up));
    const s = sp.toString();
    return s ? `?${s}` : "";
  }

  const totalTrafficViews = sumDaily(dailyRows, "views");
  const totalTrafficVisitors = sumDaily(dailyRows, "visitors");
  const totalNewUsers = sumDaily(dailyRows, "new_users");
  const totalRevenue30 = sumDaily(dailyRows, "revenue");
  const newUsersSeries = dailySeries(dailyRows, "new_users");
  const revenueSeries = dailySeries(dailyRows, "revenue");

  const dashboardKpis: {
    icon: LucideIcon;
    label: string;
    value: string;
    hint: string;
  }[] = [
    {
      icon: TrendingUp,
      label: t("dashboard.mrr"),
      value: mrr === null ? "—" : formatPrice(mrr, locale),
      hint:
        mrr === null
          ? t("dashboard.mrrNoCalc")
          : t("dashboard.mrrSubscriptions", { count: mrrSubscriptions }),
    },
    {
      icon: Users,
      label: t("dashboard.totalUsers"),
      value: nfmt.format(metrics.usersTotal),
      hint: t("dashboard.totalUsersHint", {
        admins: metrics.usersByRole.admin ?? 0,
        supers: metrics.usersByRole.superadmin ?? 0,
      }),
    },
    {
      icon: Wrench,
      label: t("dashboard.activeRaffles"),
      value: nfmt.format(metrics.rafflesActive),
      hint: t("dashboard.activeRafflesHint"),
    },
    {
      icon: Eye,
      label: t("dashboard.visits30"),
      value: nfmt.format(totalTrafficViews),
      hint: t("dashboard.visits30Hint", {
        count: nfmt.format(totalTrafficVisitors),
      }),
    },
    {
      icon: Coins,
      label: t("dashboard.revenue30"),
      value: formatPrice(totalRevenue30, locale),
      hint: t("dashboard.revenue30Hint"),
    },
    {
      icon: Users,
      label: t("dashboard.newUsers30"),
      value: nfmt.format(totalNewUsers),
      hint: t("dashboard.newUsers30Hint"),
    },
  ];

  const periodStats = [
    {
      icon: Coins,
      label: t("dashboard.revenueRange", { range: rangeLabel }),
      value: formatPrice(metrics.revenueTotal, locale),
      hint: t("dashboard.revenueHint", {
        mp: formatPrice(metrics.paymentsRevenue, locale),
        manual: formatPrice(metrics.manualRevenue, locale),
      }),
    },
    {
      icon: Ticket,
      label: t("dashboard.soldRange", { range: rangeLabel }),
      value: nfmt.format(metrics.numbersSold),
      hint: t("dashboard.soldHint", {
        count: nfmt.format(metrics.manualCount),
      }),
    },
  ];

  const secondary = [
    {
      icon: TrendingUp,
      label: t("dashboard.approvedRange", { range: rangeLabel }),
      value: nfmt.format(metrics.paymentsCount),
    },
    {
      icon: Crown,
      label: t("dashboard.avgTicket"),
      value:
        metrics.paymentsCount > 0
          ? formatPrice(
              metrics.paymentsRevenue / metrics.paymentsCount,
              locale,
            )
          : "—",
    },
    {
      icon: MessageCircle,
      label: t("dashboard.pendingRequests"),
      value: nfmt.format(pendingCount),
    },
    {
      icon: ShieldCheck,
      label: t("dashboard.pendingKyc"),
      value: nfmt.format(kycPendingCount),
    },
    {
      icon: Coins,
      label: t("dashboard.manualSales"),
      value: formatPrice(metrics.manualRevenue, locale),
    },
    {
      icon: Gift,
      label: t("dashboard.successfulReferrals"),
      value: nfmt.format(referidosExitosos),
    },
  ];

  // Total de cuentas registradas: los contadores de `listUsers` son globales
  // por rol, no dependen del filtro de búsqueda que esté aplicado.
  const registeredUsers = usersResult
    ? usersResult.counts.user +
      usersResult.counts.admin +
      usersResult.counts.superadmin
    : metrics.usersTotal;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-fg-subtle">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LocaleLink
            href="/admin/super/planes"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Settings2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t("configurePlans")}
          </LocaleLink>
          <LocaleLink
            href="/admin/super/bajas"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <UserX className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t("accountDeletions")}
          </LocaleLink>
          <LocaleLink
            href="/admin/super/sandbox"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <FlaskConical className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t("drawSimulator")}
          </LocaleLink>
        </div>
      </header>

      {/* Avisos de datos que no se pudieron leer */}
      {issues.length > 0 && (
        <div
          role="status"
          className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-medium">{t("issuesTitle")}</p>
            <ul className="list-inside list-disc text-xs">
              {issues.map((issue, index) => (
                <li key={`${index}-${issue}`}>{issue}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Pestañas principales */}
      <nav
        aria-label={t("navAria")}
        className="border-b border-hairline"
      >
        <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {SECTIONS.map((item) => {
            const active = section === item.key;
            return (
              <li key={item.key} className="shrink-0">
                <LocaleLink
                  href={`/admin/super${qs({ tab: item.key })}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-brand-500 text-fg"
                      : "border-transparent text-fg-subtle hover:border-hairline-strong hover:text-fg",
                  )}
                >
                  <item.icon
                    className="h-4 w-4"
                    aria-hidden="true"
                    strokeWidth={active ? 2.2 : 1.8}
                  />
                  {t(`sections.${item.key}`)}
                  {item.key === "usuarios" && pendingCount > 0 && (
                    <Badge variant="warning">{pendingCount}</Badge>
                  )}
                  {item.key === "denuncias" &&
                    (reportsPendingCount ?? 0) > 0 && (
                      <Badge variant="warning">{reportsPendingCount}</Badge>
                    )}
                </LocaleLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ================= DASHBOARD ================= */}
      {section === "dashboard" && (
        <div className="space-y-8">
          <section aria-labelledby="pulso-title" className="space-y-3">
            <h2
              id="pulso-title"
              className="font-display text-lg font-semibold"
            >
              {t("dashboard.pulseTitle")}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {dashboardKpis.map((kpi) => (
                <KpiCard key={kpi.label} {...kpi} />
              ))}
            </div>
          </section>

          <section aria-labelledby="graficos-title" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2
                id="graficos-title"
                className="font-display text-lg font-semibold"
              >
                {t("dashboard.activityTitle")}
              </h2>
              <Badge variant="secondary">{t("dashboard.last30")}</Badge>
            </div>

            {dailyNote && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200">
                {dailyNote}
              </p>
            )}

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>{t("dashboard.visitsTitle")}</CardTitle>
                  <CardDescription>
                    {t("dashboard.visitsDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TrafficChart data={traffic} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("dashboard.newUsersTitle")}</CardTitle>
                  <CardDescription>
                    {t("dashboard.newUsersDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <MetricBarChart
                    data={newUsersSeries}
                    label={t("dashboard.newUsersLabel")}
                    tone="amber"
                    valueType="count"
                    empty={{
                      icon: "users",
                      title: t("dashboard.newUsersEmptyTitle"),
                      description: t("dashboard.newUsersEmptyDescription"),
                    }}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("dashboard.revenueChartTitle")}</CardTitle>
                  <CardDescription>
                    {t("dashboard.revenueChartDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <MetricBarChart
                    data={revenueSeries}
                    label={t("dashboard.revenueChartLabel")}
                    tone="gold"
                    valueType="ars"
                    empty={{
                      icon: "coins",
                      title: t("dashboard.revenueEmptyTitle"),
                      description: t("dashboard.revenueEmptyDescription"),
                    }}
                  />
                </CardContent>
              </Card>
            </div>
          </section>

          <section aria-labelledby="periodo-title" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2
                id="periodo-title"
                className="font-display text-lg font-semibold"
              >
                {t("dashboard.periodTitle")}
              </h2>
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs text-fg-subtle">
                  {t("dashboard.periodLabel")}
                </span>
                {RANGES.map((r) => (
                  <LocaleLink
                    key={r.key}
                    href={`/admin/super${qs({ range: r.key })}`}
                    aria-current={range === r.key ? "true" : undefined}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      range === r.key
                        ? "bg-brand-500 text-brand-foreground"
                        : "text-fg-subtle hover:bg-panel-2 hover:text-fg",
                    )}
                  >
                    {t(`ranges.${r.key}`)}
                  </LocaleLink>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {periodStats.map((stat) => (
                <KpiCard key={stat.label} {...stat} />
              ))}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {secondary.map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center gap-2 rounded-lg border border-hairline bg-panel-1 px-3 py-2"
                >
                  <stat.icon
                    className="h-4 w-4 shrink-0 text-fg-subtle"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs text-fg-subtle">
                      {stat.label}
                    </p>
                    <p className="truncate font-mono text-sm font-semibold tabular-nums">
                      {stat.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="precios-title" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2
                id="precios-title"
                className="font-display text-lg font-semibold"
              >
                {t("dashboard.planPricesTitle")}
              </h2>
              <span className="text-xs text-fg-subtle">
                {t("dashboard.planPricesNote")}
              </span>
            </div>
            <PlanPricesPanel prices={planPrices} />
          </section>

          <section aria-labelledby="licencias-title" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2
                id="licencias-title"
                className="font-display text-lg font-semibold"
              >
                {t("dashboard.licensesTitle")}
              </h2>
              <span className="text-xs text-fg-subtle">
                {t("dashboard.licensesRecent", { count: licenseCodes.length })}
              </span>
            </div>
            <LicenseCodesPanel codes={licenseCodes} />
          </section>
        </div>
      )}

      {/* ================= USUARIOS ================= */}
      {section === "usuarios" && (
        <div className="space-y-8">
          {/* Solicitudes de rol */}
          <section aria-labelledby="solicitudes-title" className="space-y-4">
            <div>
              <h2
                id="solicitudes-title"
                className="font-display text-lg font-semibold"
              >
                {t("users.requestsTitle")}
              </h2>
              <p className="text-sm text-fg-subtle">
                {t("users.requestsDescription")}
              </p>
            </div>

            <div className="flex flex-wrap gap-1 border-b border-hairline">
              {TABS.map((tab) => (
                <LocaleLink
                  key={tab.key}
                  href={`/admin/super${qs({ rtab: tab.key })}`}
                  aria-current={requestTab === tab.key ? "true" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                    requestTab === tab.key
                      ? "border-brand-500 text-fg"
                      : "border-transparent text-fg-subtle hover:text-fg",
                  )}
                >
                  {t(`tabs.${tab.key}`)}
                  <span
                    className={cn(
                      "rounded-full px-1.5 font-mono text-[11px] tabular-nums",
                      requestTab === tab.key
                        ? "bg-brand-500 text-brand-foreground"
                        : "bg-panel-2 text-fg-subtle",
                    )}
                  >
                    {tabCounts[tab.key]}
                  </span>
                </LocaleLink>
              ))}
            </div>

            {requests.length === 0 ? (
              <EmptyState
                icon={MessageCircle}
                title={t("users.requestsEmptyTitle")}
                description={t("users.requestsEmptyDescription")}
              />
            ) : (
              <div className="space-y-3">
                {requests.map((request) => {
                  const link = waLink(request.phone, t("whatsappMessage"));
                  return (
                    <Card key={request.id}>
                      <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">
                              {request.full_name || t("users.noName")}
                            </p>
                            <Badge variant="secondary">
                              {roleLabel(request.role)}
                            </Badge>
                          </div>
                          {request.email && (
                            <p className="break-all text-xs text-fg-subtle">
                              {request.email}
                            </p>
                          )}
                          <p className="text-xs text-fg-subtle">
                            {request.phone || t("users.noPhone")}
                          </p>
                          {request.request_tools && (
                            <p className="rounded-md bg-panel-2 p-2 text-xs">
                              {t("users.wouldRaffle", {
                                value: request.request_tools,
                              })}
                            </p>
                          )}
                          {request.request_social && (
                            <p className="break-words rounded-md bg-panel-2 p-2 text-xs">
                              {t("users.social", {
                                value: request.request_social,
                              })}
                            </p>
                          )}
                          {request.request_message ? (
                            <p className="mt-1 whitespace-pre-wrap break-words rounded-md bg-panel-2 p-2 text-xs">
                              {t("users.message", {
                                value: request.request_message,
                              })}
                            </p>
                          ) : (
                            <p className="text-xs italic text-fg-subtle">
                              {t("users.noMessage")}
                            </p>
                          )}
                          <p className="text-[11px] text-fg-subtle">
                            {t("users.userSince", {
                              date: formatDateTime(request.created_at, locale),
                            })}
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
                              <MessageCircle
                                className="mr-1.5 h-4 w-4 text-emerald-700 dark:text-emerald-400"
                                aria-hidden="true"
                              />
                              WhatsApp
                            </a>
                          )}
                          {requestTab === "pending" ? (
                            <RoleRequestActions userId={request.id} />
                          ) : (
                            <Badge
                              variant={
                                requestTab === "approved"
                                  ? "success"
                                  : "destructive"
                              }
                            >
                              {requestTab === "approved"
                                ? t("users.approvedBadge")
                                : t("users.rejectedBadge")}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Verificaciones de identidad */}
          <section aria-labelledby="kyc-title" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2
                  id="kyc-title"
                  className="font-display text-lg font-semibold"
                >
                  {t("users.kycTitle")}
                </h2>
                <p className="text-sm text-fg-subtle">
                  {t("users.kycDescription")}
                </p>
              </div>
              <Badge variant="secondary">
                {t("users.kycPending", { count: kycPendingCount })}
              </Badge>
            </div>

            {pendingVerifications.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title={t("users.kycEmptyTitle")}
                description={t("users.kycEmptyDescription")}
              />
            ) : (
              <div className="space-y-3">
                {pendingVerifications.map((pending) => {
                  const organizerName =
                    pending.full_name || t("users.organizerFallback");
                  const documents = [
                    {
                      key: "front",
                      label: t("users.docFront"),
                      alt: t("users.docFrontAlt", { name: organizerName }),
                      url: pending.dniFrontUrl,
                    },
                    {
                      key: "back",
                      label: t("users.docBack"),
                      alt: t("users.docBackAlt", { name: organizerName }),
                      url: pending.dniBackUrl,
                    },
                    {
                      key: "face",
                      label: t("users.docSelfie"),
                      alt: t("users.docSelfieAlt", { name: organizerName }),
                      url: pending.faceUrl,
                    },
                  ];
                  const loadedCount = documents.filter(
                    (doc) => doc.url,
                  ).length;
                  const hasAllDocuments = Boolean(
                    pending.dni_front_url &&
                      pending.dni_back_url &&
                      pending.face_url,
                  );

                  return (
                    <Card key={pending.id}>
                      <CardContent className="space-y-3 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="font-semibold">
                              {pending.full_name || t("users.noName")}
                            </p>
                            <p className="truncate text-xs text-fg-subtle">
                              {pending.email || pending.id}
                            </p>
                            <p className="text-[11px] text-fg-subtle">
                              {t("users.requestMeta", {
                                date: pending.created_at
                                  ? formatDateTime(pending.created_at, locale)
                                  : t("users.noDate"),
                                count: loadedCount,
                              })}
                            </p>
                            {/* Las dos direcciones juntas: la del DNI es un
                                dato legal y la de entrega es logística. No
                                tienen que coincidir; el revisor las compara. */}
                            <div className="space-y-0.5 text-[11px] text-fg-subtle">
                              <p>
                                <span className="font-medium">
                                  {t("users.dniLabel")}
                                </span>{" "}
                                {pending.dni_address ||
                                  t("users.noDniAddress")}
                              </p>
                              <p>
                                <span className="font-medium">
                                  {t("users.deliveryLabel")}
                                </span>{" "}
                                {composeDeliveryAddress(pending) ||
                                  t("users.noDeliveryAddress")}
                              </p>
                              {pending.dni_address &&
                                !addressMatches(
                                  pending,
                                  pending.dni_address,
                                ) && (
                                  <p className="text-amber-700 dark:text-amber-300">
                                    {t("users.addressMismatch")}
                                  </p>
                                )}
                            </div>
                          </div>
                          <VerificationActions
                            userId={pending.id}
                            hasAllDocuments={hasAllDocuments}
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          {documents.map((doc) =>
                            doc.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={doc.key}
                                src={doc.url}
                                alt={doc.alt}
                                className="aspect-[16/10] w-full rounded-lg border border-hairline object-cover"
                              />
                            ) : (
                              <div
                                key={doc.key}
                                className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-hairline px-2 text-center text-xs text-fg-subtle"
                              >
                                <span className="font-medium">
                                  {doc.label}
                                </span>
                                <span>{t("users.noImage")}</span>
                              </div>
                            ),
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Listado de usuarios */}
          <section aria-labelledby="usuarios-title" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2
                  id="usuarios-title"
                  className="font-display text-lg font-semibold"
                >
                  {t("users.usersTitle")}
                </h2>
                <p className="text-sm text-fg-subtle">
                  {t("users.usersDescription")}
                </p>
              </div>
              <span className="text-sm text-fg-subtle">
                {t("users.registered", { count: registeredUsers })}
              </span>
            </div>

            {usersResult ? (
              <SuperAdminDashboard
                initialUsers={usersResult.users}
                initialTotal={usersResult.total}
                initialPage={usersResult.page}
                pageSize={usersResult.pageSize}
                initialQuery={usersQuery}
                initialRole={usersRole}
                counts={usersResult.counts}
              />
            ) : (
              <EmptyState
                title={t("users.loadErrorTitle")}
                description={t("users.loadErrorDescription")}
              />
            )}
          </section>
        </div>
      )}

      {/* ================= SORTEOS ================= */}
      {section === "sorteos" && (
        <section aria-labelledby="sorteos-title" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2
                id="sorteos-title"
                className="font-display text-lg font-semibold"
              >
                {t("raffles.title")}
              </h2>
              <p className="text-sm text-fg-subtle">
                {t("raffles.description")}
              </p>
            </div>
            {raffles.length > 0 && (
              <span className="text-sm text-fg-subtle">
                {t("raffles.onScreen", { count: raffles.length })}
              </span>
            )}
          </div>

          <ResponsiveTable
            rows={raffles}
            getRowKey={(raffle) => raffle.id}
            empty={
              <EmptyState
                icon={Ticket}
                title={t("raffles.emptyTitle")}
                description={t("raffles.emptyDescription")}
              />
            }
            columns={[
              {
                key: "title",
                header: t("table.raffle"),
                render: (raffle) => (
                  <div className="min-w-0">
                    <p className="font-medium">
                      {raffle.title || t("raffles.noTitle")}
                    </p>
                    <p className="font-mono text-[11px] text-fg-subtle">
                      {raffle.id.slice(0, 8)}
                    </p>
                  </div>
                ),
              },
              {
                key: "status",
                header: t("table.status"),
                render: (raffle) => {
                  const status = RAFFLE_STATUS[raffle.status];
                  return (
                    <Badge variant={status?.variant ?? "secondary"}>
                      {status
                        ? t(`status.${status.labelKey}`)
                        : raffle.status}
                    </Badge>
                  );
                },
              },
              {
                key: "price",
                header: t("raffles.price"),
                render: (raffle) => (
                  <span className="font-mono tabular-nums">
                    {formatPrice(
                      Number(raffle.price_per_number) || 0,
                      locale,
                    )}
                  </span>
                ),
              },
              {
                key: "draw",
                header: t("raffles.drawDate"),
                render: (raffle) => (
                  <span className="whitespace-nowrap text-fg-muted">
                    {raffle.draw_date
                      ? formatDateTime(raffle.draw_date, locale)
                      : t("raffles.noDate")}
                  </span>
                ),
              },
              {
                key: "bonus",
                header: t("raffles.bonus"),
                render: (raffle) => {
                  const origenes = bonusDestino.get(raffle.id) ?? [];
                  const destinoTitulo = raffle.bonus_raffle_id
                    ? tituloSorteo.get(raffle.bonus_raffle_id) ??
                      t("raffles.exclusive")
                    : null;
                  const regalados = premiosDestino.get(raffle.id) ?? 0;

                  if (origenes.length === 0 && !destinoTitulo) {
                    return <span className="text-fg-subtle">—</span>;
                  }

                  return (
                    <div className="space-y-1 text-xs">
                      {destinoTitulo && (
                        <Badge variant="info">
                          {t("raffles.deliveryIn", {
                            title: destinoTitulo,
                          })}
                        </Badge>
                      )}
                      {origenes.length > 0 && (
                        <p className="text-fg-muted">
                          {t("raffles.receivesFrom", {
                            list: origenes.join(", "),
                          })}
                        </p>
                      )}
                      <p className="text-fg-muted">
                        {t("raffles.gifted", { count: regalados })}
                      </p>
                    </div>
                  );
                },
              },
              {
                key: "organizer",
                header: t("raffles.organizer"),
                render: (raffle) => (
                  <span className="break-all text-fg-muted">
                    {raffle.created_by
                      ? organizerById.get(raffle.created_by) ?? "—"
                      : "—"}
                  </span>
                ),
              },
              {
                key: "featured",
                header: t("raffles.featured"),
                render: (raffle) => (
                  <FeatureRaffleButton
                    raffleId={raffle.id}
                    featured={Boolean(raffle.is_featured)}
                    status={raffle.status}
                  />
                ),
              },
              {
                key: "links",
                header: t("table.links"),
                render: (raffle) => (
                  <div className="flex flex-wrap items-center gap-3">
                    <LocaleLink
                      href={`/sorteos/${raffle.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                    >
                      {t("raffles.public")}
                      <ArrowUpRight
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    </LocaleLink>
                    <LocaleLink
                      href={`/admin/sorteos/${raffle.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                    >
                      {t("raffles.panel")}
                      <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </LocaleLink>
                  </div>
                ),
              },
            ]}
          />
        </section>
      )}

      {/* ================= DENUNCIAS ================= */}
      {section === "referidos" && (
        <section aria-labelledby="referidos-title" className="space-y-4">
          <div>
            <h2
              id="referidos-title"
              className="font-display text-lg font-semibold"
            >
              {t("referrals.title")}
            </h2>
            <p className="text-sm text-fg-subtle">
              {t("referrals.description")}
            </p>
          </div>

          <ResponsiveTable
            rows={referidosTop}
            getRowKey={(fila) => fila.referrerId}
            empty={
              <EmptyState
                icon={Gift}
                title={t("referrals.emptyTitle")}
                description={t("referrals.emptyDescription")}
              />
            }
            columns={[
              {
                key: "nombre",
                header: t("referrals.referrer"),
                render: (fila) => (
                  <span className="font-medium">{fila.nombre}</span>
                ),
              },
              {
                key: "invitados",
                header: t("referrals.invited"),
                render: (fila) => (
                  <span className="tabular-nums">{fila.invitados}</span>
                ),
              },
              {
                key: "compraron",
                header: t("referrals.bought"),
                render: (fila) => (
                  <Badge variant={fila.compraron > 0 ? "success" : "secondary"}>
                    {fila.compraron}
                  </Badge>
                ),
              },
              {
                key: "premios",
                header: t("referrals.prizes"),
                render: (fila) => (
                  <span className="tabular-nums">{fila.premios}</span>
                ),
              },
              {
                key: "id",
                header: t("referrals.id"),
                render: (fila) => (
                  <span className="font-mono text-[11px] text-fg-subtle">
                    {fila.referrerId.slice(0, 8)}
                  </span>
                ),
              },
            ]}
          />
        </section>
      )}

      {section === "notificaciones" && (
        <section aria-labelledby="notis-title" className="space-y-4">
          <div>
            <h2
              id="notis-title"
              className="font-display text-lg font-semibold"
            >
              {t("notifications.title")}
            </h2>
            <p className="text-sm text-fg-subtle">
              {t("notifications.description")}
            </p>
          </div>

          {superNotifs.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={t("notifications.emptyTitle")}
              description={t("notifications.emptyDescription")}
            />
          ) : (
            <ul className="space-y-2">
              {superNotifs.map((noti) => (
                <li
                  key={noti.id}
                  className="rounded-xl border border-hairline bg-panel-1 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {noti.title ?? noti.type}
                    </p>
                    <span className="text-[11px] text-fg-subtle">
                      {formatDateTime(noti.created_at, locale)}
                    </span>
                  </div>
                  {noti.message && (
                    <p className="mt-1 text-sm text-fg-muted">{noti.message}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-fg-subtle">
                    <span className="font-mono">{noti.type}</span>
                    {!noti.read_at && (
                      <Badge variant="warning">
                        {t("notifications.unread")}
                      </Badge>
                    )}
                    {noti.raffle_id && (
                      <LocaleLink
                        href={`/admin/sorteos/${noti.raffle_id}`}
                        className="font-medium text-brand-700 hover:underline dark:text-brand-300"
                      >
                        {t("notifications.viewRaffle")}
                      </LocaleLink>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {section === "denuncias" && (
        <section aria-labelledby="denuncias-title" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2
                id="denuncias-title"
                className="font-display text-lg font-semibold"
              >
                {t("reports.title")}
              </h2>
              <p className="text-sm text-fg-subtle">
                {t("reports.description")}
              </p>
            </div>
            <span className="text-sm text-fg-subtle">
              {t("reports.pending", { count: reports.length })}
            </span>
          </div>

          {reportsNote && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200">
              {reportsNote}
            </p>
          )}

          {reports.length === 0 ? (
            <EmptyState
              icon={Flag}
              title={
                reportsNote
                  ? t("reports.emptyErrorTitle")
                  : t("reports.emptyTitle")
              }
              description={
                reportsNote
                  ? t("reports.emptyErrorDescription")
                  : t("reports.emptyDescription")
              }
            />
          ) : (
            <div className="space-y-3">
              {reports.map((report) => {
                const raffleStatus = RAFFLE_STATUS[report.raffleStatus];
                return (
                  <Card key={report.id}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{report.raffleTitle}</p>
                            <Badge variant={raffleStatus?.variant ?? "secondary"}>
                              {raffleStatus
                                ? t(`status.${raffleStatus.labelKey}`)
                                : "—"}
                            </Badge>
                            <Badge variant="warning">
                              {reportReasonLabel(report.reason)}
                            </Badge>
                          </div>
                          <p className="break-all text-xs text-fg-subtle">
                            {t("reports.reporter", {
                              who:
                                report.reporterEmail ||
                                t("reports.deletedAccount"),
                            })}
                          </p>
                          <p className="text-[11px] text-fg-subtle">
                            {t("reports.meta", {
                              date: formatDateTime(report.createdAt, locale),
                              id: report.id.slice(0, 8),
                            })}
                          </p>
                          {report.raffleStatus !== "unknown" && (
                            <LocaleLink
                              href={`/sorteos/${report.raffleId}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                            >
                              {t("reports.viewPublic")}
                              <ArrowUpRight
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            </LocaleLink>
                          )}
                        </div>

                        <ReportActions
                          report={{
                            id: report.id,
                            raffleId: report.raffleId,
                            raffleTitle: report.raffleTitle,
                            raffleStatus: report.raffleStatus,
                            reporterEmail: report.reporterEmail,
                            reason: report.reason,
                            comment: report.comment,
                            status: report.status,
                            createdAt: report.createdAt,
                          }}
                        />
                      </div>

                      {report.comment ? (
                        <p className="whitespace-pre-wrap break-words rounded-md bg-panel-2 p-2 text-sm">
                          {report.comment}
                        </p>
                      ) : (
                        <p className="text-xs italic text-fg-subtle">
                          {t("reports.noComment")}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ================= AUDITORÍA ================= */}
      {section === "auditoria" && (
        <section aria-labelledby="auditoria-title" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2
                id="auditoria-title"
                className="font-display text-lg font-semibold"
              >
                {t("audit.title")}
              </h2>
              <p className="text-sm text-fg-subtle">
                {t("audit.description")}
              </p>
            </div>
            <span className="text-sm text-fg-subtle">
              {t("audit.count", { count: logs.length })}
            </span>
          </div>

          <form
            method="get"
            action={inLocale("/admin/super")}
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="tab" value="auditoria" />
            <div className="w-full space-y-1 sm:w-auto">
              <label
                htmlFor="audit-action"
                className="block text-xs font-medium text-fg-subtle"
              >
                {t("audit.actionLabel")}
              </label>
              <select
                id="audit-action"
                name="accion"
                defaultValue={auditFilter}
                className="h-10 w-full max-w-full rounded-lg border border-hairline bg-panel-1 px-3 text-sm text-fg focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:w-auto"
              >
                <option value="all">{t("audit.allActions")}</option>
                {AUDIT_ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {actionLabel(action)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm" variant="outline">
              {t("audit.filter")}
            </Button>
            {auditFilter !== "all" && (
              <LocaleLink
                href={`/admin/super${qs({ accion: "all" })}`}
                className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
              >
                {t("audit.clearFilter")}
              </LocaleLink>
            )}
          </form>

          <ResponsiveTable
            rows={logs}
            getRowKey={(log) => log.id}
            empty={
              <EmptyState
                icon={ScrollText}
                title={
                  auditFilter === "all"
                    ? t("audit.emptyAllTitle")
                    : t("audit.emptyFilteredTitle")
                }
                description={
                  auditFilter === "all"
                    ? t("audit.emptyAllDescription")
                    : t("audit.emptyFilteredDescription")
                }
              />
            }
            columns={[
              {
                key: "date",
                header: t("audit.date"),
                render: (log) => (
                  <span className="whitespace-nowrap text-fg-muted">
                    {formatDateTime(log.created_at, locale)}
                  </span>
                ),
              },
              {
                key: "admin",
                header: t("audit.superadmin"),
                render: (log) => (
                  <span className="break-all">
                    {log.admin_email || log.admin_id || "—"}
                  </span>
                ),
              },
              {
                key: "action",
                header: t("audit.actionLabel"),
                render: (log) => (
                  <Badge
                    variant={
                      log.action === "IMPERSONATE_USER" ||
                      log.action === "IMPERSONATE_END" ||
                      log.action === "EDIT_PROFILE"
                        ? "warning"
                        : "secondary"
                    }
                  >
                    {actionLabel(log.action)}
                  </Badge>
                ),
              },
              {
                key: "target",
                header: t("audit.target"),
                render: (log) => (
                  <span className="break-all text-fg-muted">
                    {log.target_email || log.target_user_id || "—"}
                  </span>
                ),
              },
            ]}
          />
        </section>
      )}
    </div>
  );
}
