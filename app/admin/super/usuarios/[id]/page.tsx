import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  CalendarDays,
  Coins,
  Ticket,
} from "lucide-react";

import { requireSuperadminSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SupportUserActions } from "@/components/SupportUserActions";
import { PlanSupportActions } from "@/components/PlanSupportActions";
import { formatDateTime, formatPrice } from "@/lib/utils";
import { roleLabel } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SupportRaffle {
  id: string;
  title: string;
  status: string;
  price_per_number: number;
  draw_date: string;
  created_at: string;
}

/**
 * Ficha de soporte de una cuenta: datos, estado de ban, actividad como
 * organizador y como comprador. Todo se lee con service role y cada apertura
 * queda registrada en `admin_audit_logs` (SUPPORT_VIEW).
 */
export default async function SuperUserSupportPage({
  params,
}: {
  params: { id: string };
}) {
  if (!UUID_RE.test(params.id)) notFound();

  const session = await requireSuperadminSession();
  if (!session) notFound();

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select(
      "id, full_name, email, role, created_at, role_expires_at, plan, plan_expires_at, is_banned, banned_at, ban_reason, avatar_url, admin_request_status",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!profile) notFound();

  try {
    await admin.from("admin_audit_logs").insert({
      admin_id: session.id,
      admin_email: session.email,
      action: "SUPPORT_VIEW",
      target_user_id: profile.id,
      target_email: profile.email,
      details: JSON.stringify({ view: "ficha" }),
    });
  } catch {
    // La auditoría no puede romper la vista.
  }

  const { data: rafflesData } = await admin
    .from("raffles")
    .select("id, title, status, price_per_number, draw_date, created_at")
    .eq("created_by", profile.id)
    .order("created_at", { ascending: false });

  const raffles = (rafflesData ?? []) as SupportRaffle[];

  const counts = await Promise.all(
    raffles.map(async (raffle) => {
      const [sold, reserved] = await Promise.all([
        admin
          .from("raffle_numbers")
          .select("*", { count: "exact", head: true })
          .eq("raffle_id", raffle.id)
          .eq("status", "sold"),
        admin
          .from("raffle_numbers")
          .select("*", { count: "exact", head: true })
          .eq("raffle_id", raffle.id)
          .eq("status", "reserved"),
      ]);
      return {
        id: raffle.id,
        sold: sold.count ?? 0,
        reserved: reserved.count ?? 0,
      };
    }),
  );

  const byId = new Map(counts.map((row) => [row.id, row]));
  const totalSold = counts.reduce((sum, row) => sum + row.sold, 0);
  const totalReserved = counts.reduce((sum, row) => sum + row.reserved, 0);
  const revenue = raffles.reduce(
    (sum, raffle) =>
      sum + Number(raffle.price_per_number) * (byId.get(raffle.id)?.sold ?? 0),
    0,
  );

  const { data: planOrdersData } = await admin
    .from("plan_orders")
    .select(
      "id, plan, amount_ars, days, method, note, status, created_at, paid_at, expires_at",
    )
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(25);

  const planOrders = planOrdersData ?? [];
  const currentPlan =
    profile.plan === "premium"
      ? "premium"
      : profile.plan === "organizador"
        ? "organizador"
        : null;

  const { data: boughtData } = await admin
    .from("raffle_numbers")
    .select("raffle_id, number, status, sold_at, reserved_until")
    .or(`sold_to.eq.${profile.id},reserved_by.eq.${profile.id}`)
    .order("number", { ascending: true })
    .limit(200);

  const bought = boughtData ?? [];
  const boughtRaffleIds = Array.from(
    new Set(bought.map((row) => row.raffle_id as string)),
  );

  const { data: boughtRaffles } = boughtRaffleIds.length
    ? await admin
        .from("raffles")
        .select("id, title")
        .in("id", boughtRaffleIds)
    : { data: [] as { id: string; title: string }[] };

  const titleById = new Map(
    (boughtRaffles ?? []).map((row) => [row.id, row.title]),
  );

  const isOrganizer = profile.role === "admin" || profile.role === "superadmin";

  return (
    <div className="space-y-6">
      <Link
        href="/admin/super"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al panel superadmin
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {profile.full_name || "Sin nombre"}
          </h1>
          <p className="break-all text-sm text-muted-foreground">
            {profile.email || "Sin email"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={profile.role === "superadmin" ? "default" : "secondary"}>
              {roleLabel(profile.role)}
            </Badge>
            {profile.is_banned && (
              <Badge variant="destructive">Suspendido</Badge>
            )}
            {profile.admin_request_status === "pending" && (
              <Badge variant="warning">Solicitud pendiente</Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/super/usuarios/${profile.id}/panel`}
            className={buttonVariants({ size: "sm" })}
          >
            Ver su panel (solo lectura)
            <ArrowUpRight className="ml-1.5 h-4 w-4" />
          </Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-1 p-4 text-sm">
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarDays className="h-4 w-4" /> Alta
            </p>
            <p className="font-medium">{formatDateTime(profile.created_at)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4 text-sm">
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Ticket className="h-4 w-4" /> Sorteos creados
            </p>
            <p className="font-medium">{raffles.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4 text-sm">
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Coins className="h-4 w-4" /> Vencimiento de plan
            </p>
            <p className="font-medium">
              {profile.role_expires_at
                ? formatDateTime(profile.role_expires_at)
                : "Sin vencimiento"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className={profile.is_banned ? "border-destructive/50" : ""}>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2 font-semibold">
            <Ban className="h-4 w-4 text-destructive" />
            {profile.is_banned ? "Cuenta suspendida" : "Suspender cuenta"}
          </div>
          {profile.is_banned ? (
            <p className="text-sm text-muted-foreground">
              Motivo: {profile.ban_reason || "sin motivo registrado"}
              {profile.banned_at
                ? ` · ${formatDateTime(profile.banned_at)}`
                : ""}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              El ban bloquea el inicio de sesión y las reservas de números. La
              cuenta no se borra y se puede revertir.
            </p>
          )}
          <SupportUserActions
            userId={profile.id}
            isBanned={profile.is_banned}
            email={profile.email}
          />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Plan y pagos</h2>
          <span className="text-sm text-muted-foreground">
            Plan actual:{" "}
            {currentPlan === "premium"
              ? "Premium"
              : currentPlan === "organizador"
                ? "Organizador"
                : "Sin plan"}{" "}
            ·{" "}
            {profile.plan_expires_at
              ? `vence ${formatDateTime(profile.plan_expires_at)}`
              : profile.role_expires_at
                ? `rol vence ${formatDateTime(profile.role_expires_at)}`
                : "sin vencimiento"}
          </span>
        </div>

        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm text-muted-foreground">
              Registrá un pago por transferencia o efectivo. La vigencia se
              extiende desde el vencimiento actual (o desde hoy si ya venció) y
              el pago queda en el historial.
            </p>
            <PlanSupportActions userId={profile.id} currentPlan={currentPlan} />
          </CardContent>
        </Card>

        {planOrders.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Días</th>
                  <th className="p-3">Monto</th>
                  <th className="p-3">Medio</th>
                  <th className="p-3">Nota</th>
                  <th className="p-3">Vence</th>
                </tr>
              </thead>
              <tbody>
                {planOrders.map((order) => (
                  <tr key={order.id} className="border-t">
                    <td className="whitespace-nowrap p-3 text-muted-foreground">
                      {formatDateTime(order.created_at)}
                    </td>
                    <td className="p-3 capitalize">{order.plan}</td>
                    <td className="p-3">{order.days}</td>
                    <td className="p-3">
                      {formatPrice(Number(order.amount_ars))}
                    </td>
                    <td className="p-3 capitalize">{order.method}</td>
                    <td className="max-w-[14rem] truncate p-3 text-muted-foreground">
                      {order.note || "—"}
                    </td>
                    <td className="whitespace-nowrap p-3 text-muted-foreground">
                      {order.expires_at
                        ? formatDateTime(order.expires_at)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isOrganizer && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Actividad como organizador</h2>
            <span className="text-sm text-muted-foreground">
              {totalSold} vendidos · {totalReserved} reservados ·{" "}
              {formatPrice(revenue)} estimado
            </span>
          </div>

          {raffles.length === 0 ? (
            <Card className="border-dashed text-center">
              <CardContent className="py-8 text-sm text-muted-foreground">
                No creó sorteos.
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">Sorteo</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Vendidos</th>
                    <th className="p-3">Reservados</th>
                    <th className="p-3">Recaudación</th>
                    <th className="p-3">Links</th>
                  </tr>
                </thead>
                <tbody>
                  {raffles.map((raffle) => {
                    const row = byId.get(raffle.id);
                    return (
                      <tr key={raffle.id} className="border-t">
                        <td className="max-w-[16rem] truncate p-3 font-medium">
                          {raffle.title}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {raffle.status}
                        </td>
                        <td className="p-3">{row?.sold ?? 0}</td>
                        <td className="p-3">{row?.reserved ?? 0}</td>
                        <td className="p-3">
                          {formatPrice(
                            Number(raffle.price_per_number) * (row?.sold ?? 0),
                          )}
                        </td>
                        <td className="space-x-3 p-3 text-xs">
                          <Link
                            href={`/sorteos/${raffle.id}`}
                            className="text-amber-600 hover:underline"
                          >
                            Público
                          </Link>
                          <Link
                            href={`/admin/super/usuarios/${profile.id}/panel`}
                            className="text-muted-foreground hover:underline"
                          >
                            Panel
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Actividad como comprador</h2>
        {bought.length === 0 ? (
          <Card className="border-dashed text-center">
            <CardContent className="py-8 text-sm text-muted-foreground">
              No tiene números comprados ni reservados.
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Sorteo</th>
                  <th className="p-3">Número</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {bought.slice(0, 100).map((row, index) => (
                  <tr key={`${row.raffle_id}-${row.number}-${index}`} className="border-t">
                    <td className="max-w-[16rem] truncate p-3">
                      {titleById.get(row.raffle_id as string) ?? "—"}
                    </td>
                    <td className="p-3 font-mono">{row.number}</td>
                    <td className="p-3 text-muted-foreground">{row.status}</td>
                    <td className="p-3 text-muted-foreground">
                      {row.sold_at
                        ? formatDateTime(row.sold_at)
                        : row.reserved_until
                          ? `Reserva hasta ${formatDateTime(row.reserved_until)}`
                          : "—"}
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
