import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowLeft,
  CalendarDays,
  Coins,
  Eye,
  Ticket,
} from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
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

  const t = await getTranslations("AdminSuperUsers");
  const locale = await getLocale();
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
      <LocaleLink
        href={`/admin/super/usuarios/${profile.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("backToSupport")}
      </LocaleLink>

      <div className="rounded-xl border border-amber-400/50 bg-amber-500/10 p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold">
          <Eye className="h-4 w-4" />
          {t("supportMode")}
        </p>
        <p className="mt-1 text-muted-foreground">
          {t("supportExplain", {
            name:
              profile.full_name || profile.email || t("thisAccount"),
          })}
        </p>
      </div>

      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {profile.full_name || t("noName")}
          </h1>
          <p className="break-all text-sm text-muted-foreground">
            {profile.email || t("noEmail")}
          </p>
        </div>
        <Badge variant={isOrganizer ? "success" : "secondary"}>
          {isOrganizer ? t("roles.admin") : t("roles.user")}
        </Badge>
        {profile.is_banned && (
          <Badge variant="destructive">{t("suspended")}</Badge>
        )}
      </header>

      {isOrganizer ? (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { label: t("table.raffles"), value: String(raffles.length), icon: Ticket },
              { label: t("table.sold"), value: String(totalSold), icon: Coins },
              { label: t("table.reserved"), value: String(totalReserved), icon: CalendarDays },
              {
                label: t("table.revenue"),
                value: formatPrice(revenue, locale),
                icon: Coins,
              },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-ink">
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
                {t("noRaffles")}
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">{t("table.raffle")}</th>
                    <th className="p-3">{t("table.status")}</th>
                    <th className="p-3">{t("table.sold")}</th>
                    <th className="p-3">{t("table.reserved")}</th>
                    <th className="p-3">{t("table.revenue")}</th>
                    <th className="p-3">{t("public")}</th>
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
                            locale,
                          )}
                        </td>
                        <td className="p-3">
                          <LocaleLink
                            href={`/sorteos/${raffle.id}`}
                            className="text-xs text-amber-800 dark:text-amber-300 hover:underline"
                          >
                            {t("viewRaffle")}
                          </LocaleLink>
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
          <h2 className="text-lg font-semibold">{t("userNumbers")}</h2>
          {bought.length === 0 ? (
            <Card className="border-dashed text-center">
              <CardContent className="py-10 text-sm text-muted-foreground">
                {t("noNumbers")}
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">{t("table.raffle")}</th>
                    <th className="p-3">{t("table.number")}</th>
                    <th className="p-3">{t("table.status")}</th>
                    <th className="p-3">{t("table.date")}</th>
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
                          ? formatDateTime(row.sold_at, locale)
                          : row.reserved_until
                            ? t("reservation", {
                                date: formatDateTime(row.reserved_until, locale),
                              })
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
