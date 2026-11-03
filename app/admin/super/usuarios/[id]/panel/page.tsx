import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Coins,
  Eye,
  Ticket,
} from "lucide-react";

import { requireSuperadminSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Modo soporte: el panel del usuario/organizador en SOLO LECTURA.
 * No impersona la sesión ni permite acciones; cada apertura queda auditada.
 */
export default async function SupportPanelPage({
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
    .select("id, full_name, email, role, is_banned, created_at")
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
      details: JSON.stringify({ view: "panel" }),
    });
  } catch {
    // La auditoría no puede romper la vista.
  }

  const isOrganizer = profile.role === "admin" || profile.role === "superadmin";

  const { data: rafflesData } = isOrganizer
    ? await admin
        .from("raffles")
        .select("id, title, status, price_per_number, draw_date")
        .eq("created_by", profile.id)
        .order("created_at", { ascending: false })
    : { data: [] as {
        id: string;
        title: string;
        status: string;
        price_per_number: number;
        draw_date: string;
      }[] };

  const raffles = rafflesData ?? [];

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

  const { data: boughtData } = isOrganizer
    ? { data: [] as never[] }
    : await admin
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
    ? await admin.from("raffles").select("id, title").in("id", boughtRaffleIds)
    : { data: [] as { id: string; title: string }[] };

  const titleById = new Map(
    (boughtRaffles ?? []).map((row) => [row.id, row.title]),
  );

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/super/usuarios/${profile.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a la ficha de soporte
      </Link>

      <div className="rounded-xl border border-amber-400/50 bg-amber-500/10 p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold">
          <Eye className="h-4 w-4" />
          Modo soporte — solo lectura
        </p>
        <p className="mt-1 text-muted-foreground">
          Estás viendo el panel de {profile.full_name || profile.email || "esta cuenta"}{" "}
          como superadmin. No hay acciones disponibles y la apertura quedó
          registrada en la auditoría.
        </p>
      </div>

      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {profile.full_name || "Sin nombre"}
          </h1>
          <p className="break-all text-sm text-muted-foreground">
            {profile.email || "Sin email"}
          </p>
        </div>
        <Badge variant={isOrganizer ? "success" : "secondary"}>
          {isOrganizer ? "Organizador" : "Usuario"}
        </Badge>
        {profile.is_banned && <Badge variant="destructive">Suspendido</Badge>}
      </header>

      {isOrganizer ? (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { label: "Sorteos", value: String(raffles.length), icon: Ticket },
              { label: "Vendidos", value: String(totalSold), icon: Coins },
              { label: "Reservados", value: String(totalReserved), icon: CalendarDays },
              { label: "Recaudación", value: formatPrice(revenue), icon: Coins },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                    <stat.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-lg font-bold">{stat.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {raffles.length === 0 ? (
            <Card className="border-dashed text-center">
              <CardContent className="py-10 text-sm text-muted-foreground">
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
                    <th className="p-3">Público</th>
                  </tr>
                </thead>
                <tbody>
                  {raffles.map((raffle) => {
                    const row = byId.get(raffle.id);
                    return (
                      <tr key={raffle.id} className="border-t">
                        <td className="max-w-[18rem] truncate p-3 font-medium">
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
                        <td className="p-3">
                          <Link
                            href={`/sorteos/${raffle.id}`}
                            className="text-xs text-amber-600 hover:underline"
                          >
                            Ver sorteo
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Números del usuario</h2>
          {bought.length === 0 ? (
            <Card className="border-dashed text-center">
              <CardContent className="py-10 text-sm text-muted-foreground">
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
                  {bought.map((row, index) => (
                    <tr key={`${row.raffle_id}-${row.number}-${index}`} className="border-t">
                      <td className="max-w-[18rem] truncate p-3">
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
      )}
    </div>
  );
}
