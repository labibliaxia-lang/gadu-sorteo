import { redirect } from "next/navigation";
import { Coins, Ticket, Users, Wrench } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RoleRequestActions } from "@/components/RoleRequestActions";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
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

  const admin = createAdminClient();

  const { data: approvedPayments } = await admin
    .from("payments")
    .select("amount")
    .eq("status", "approved");

  const { count: soldCount } = await admin
    .from("raffle_numbers")
    .select("*", { count: "exact", head: true })
    .eq("status", "sold");

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

  const { data: requests } = await admin
    .from("profiles")
    .select("id, full_name, phone, created_at")
    .eq("role_requested", true)
    .order("created_at", { ascending: true });

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
          Métricas globales y bandeja de solicitudes de rol.
        </p>
      </header>

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

      {/* Bandeja de solicitudes */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Solicitudes de administrador</h2>

        {!requests || requests.length === 0 ? (
          <Card className="border-dashed text-center">
            <CardContent className="py-12 text-muted-foreground">
              No hay solicitudes pendientes.
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
                  <RoleRequestActions userId={r.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
