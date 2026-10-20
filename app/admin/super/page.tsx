import Link from "next/link";
import { redirect } from "next/navigation";
import { Coins, Ticket, Users, Wrench } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleRequestActions } from "@/components/RoleRequestActions";
import { UserManagementTable } from "@/components/UserManagementTable";
import { cn, formatDateTime, formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = { range?: string; tab?: string };

const TABS = [
  { key: "pending", label: "Pendientes" },
  { key: "approved", label: "Aprobadas" },
  { key: "rejected", label: "Rechazadas" },
];

const RANGES = [
  { key: "all", label: "Histórico" },
  { key: "month", label: "Este mes" },
  { key: "week", label: "Últimos 7 días" },
];

const ACTION_LABELS: Record<string, string> = {
  APPROVE_ROLE: "Aprobó rol de admin",
  REJECT_ROLE: "Rechazó solicitud de rol",
  CHANGE_ROLE: "Cambió rol manualmente",
};

export default async function SuperAdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
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

  if (profile?.role !== "admin") redirect("/");

  const range = searchParams.range ?? "all";
  const tab = searchParams.tab ?? "pending";

  const admin = createAdminClient();

  // Rango de fechas para métricas financieras.
  let startIso: string | null = null;
  if (range === "week") {
    startIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  } else if (range === "month") {
    const now = new Date();
    startIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }

  // Recaudación (solo pagos aprobados, filtrada por rango).
  let paymentsQuery = admin
    .from("payments")
    .select("amount")
    .eq("status", "approved");
  if (startIso) paymentsQuery = paymentsQuery.gte("created_at", startIso);
  const { data: approvedPayments } = await paymentsQuery;

  // Números vendidos (filtrados por rango).
  let soldQuery = admin
    .from("raffle_numbers")
    .select("*", { count: "exact", head: true })
    .eq("status", "sold");
  if (startIso) soldQuery = soldQuery.gte("sold_at", startIso);
  const { count: soldCount } = await soldQuery;

  // Métricas globales (sin filtro de tiempo).
  const { count: activeCount } = await admin
    .from("raffles")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  const { count: usersCount } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true });

  const revenue = (approvedPayments ?? []).reduce(
    (sum, p) => sum + Number(p.amount),
    0,
  );

  // Solicitudes según pestaña.
  let requestsQuery = admin
    .from("profiles")
    .select("id, full_name, phone, role, created_at");
  if (tab === "pending")
    requestsQuery = requestsQuery.eq("admin_request_status", "pending");
  else if (tab === "approved")
    requestsQuery = requestsQuery.eq("admin_request_status", "approved");
  else requestsQuery = requestsQuery.eq("admin_request_status", "rejected");
  const { data: requests } = await requestsQuery.order("created_at", {
    ascending: true,
  });

  // Todos los usuarios.
  const { data: users } = await admin
    .from("profiles")
    .select("id, full_name, email, role, created_at")
    .order("created_at", { ascending: false });

  // Registro de auditoría.
  const { data: logs } = await admin
    .from("admin_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  function qs(next: Partial<SearchParams>): string {
    const r = next.range ?? range;
    const t = next.tab ?? tab;
    const sp = new URLSearchParams();
    if (r !== "all") sp.set("range", r);
    if (t !== "pending") sp.set("tab", t);
    const s = sp.toString();
    return s ? `?${s}` : "";
  }

  const stats = [
    { icon: Coins, label: "Recaudación total", value: formatPrice(revenue) },
    { icon: Ticket, label: "Números vendidos", value: String(soldCount ?? 0) },
    { icon: Wrench, label: "Sorteos activos", value: String(activeCount ?? 0) },
    { icon: Users, label: "Usuarios", value: String(usersCount ?? 0) },
  ];

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Superadministrador</h1>
        <p className="text-sm text-muted-foreground">
          Consola de control: métricas, solicitudes de rol y usuarios.
        </p>
      </header>

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

      {/* KPIs */}
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
              </div>
            </CardContent>
          </Card>
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
                "rounded-t-md px-3 py-2 text-sm font-medium transition",
                tab === t.key
                  ? "border-b-2 border-amber-500 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
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
            {requests.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold">{r.full_name || "Sin nombre"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.phone || "Sin teléfono"}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {r.id}
                    </p>
                  </div>

                  {tab === "pending" ? (
                    <RoleRequestActions userId={r.id} />
                  ) : (
                    <Badge variant={tab === "approved" ? "success" : "secondary"}>
                      {tab === "approved" ? "Aprobada" : "Rechazada"}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Gestión de usuarios */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Usuarios</h2>
          <span className="text-sm text-muted-foreground">
            {users?.length ?? 0} registrados
          </span>
        </div>
        <UserManagementTable users={users ?? []} />
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
                  <th className="p-3">Admin</th>
                  <th className="p-3">Acción</th>
                  <th className="p-3">Usuario afectado</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
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
