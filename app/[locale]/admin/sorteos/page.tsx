import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Ticket } from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, formatPrice } from "@/lib/utils";
import type { Raffle } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusVariant: Record<
  Raffle["status"],
  "success" | "warning" | "secondary"
> = {
  active: "success",
  closed: "warning",
  drawn: "secondary",
  cancelled: "secondary",
  paused: "warning",
};

export default async function AdminSorteosPage() {
  const t = await getTranslations("AdminSorteos");
  const tc = await getTranslations("Common");
  const locale = await getLocale();
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
  const isSuper = profile?.role === "superadmin";

  let rafflesQuery = supabase
    .from("raffles")
    .select("*")
    .order("created_at", { ascending: false });

  // Organizadores: solo sus propios sorteos; superadmin: todos.
  if (!isSuper) rafflesQuery = rafflesQuery.eq("created_by", user.id);

  const { data: raffles } = await rafflesQuery;

  return (
    <div className="space-y-4">
      {raffles && raffles.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button asChild variant="outline">
              <LocaleLink href="/admin/sorteos/nuevo">
                {t("createFirst")}
              </LocaleLink>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {raffles?.map((raffle: Raffle) => (
            <Card key={raffle.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-lg">{raffle.title}</CardTitle>
                <Badge variant={statusVariant[raffle.status]}>
                  {tc(`status.${raffle.status}`)}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 font-mono text-[12px] text-fg-subtle">
                <span>
                  {t("priceAndDate", {
                    price: formatPrice(Number(raffle.price_per_number), locale),
                    date: formatDateTime(raffle.draw_date, locale),
                  })}
                </span>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <LocaleLink href={`/admin/sorteos/${raffle.id}`}>
                      {t("manage")}
                    </LocaleLink>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <LocaleLink href={`/admin/sorteos/${raffle.id}/premios`}>
                      {t("prizes")}
                    </LocaleLink>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <LocaleLink href={`/sorteos/${raffle.id}`}>
                      {t("viewPublic")}
                    </LocaleLink>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
