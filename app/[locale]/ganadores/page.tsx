import type { Metadata } from "next";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { BadgeCheck, Gift, Trophy } from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Ganadores");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export const dynamic = "force-dynamic";

interface DrawnRaffle {
  id: string;
  title: string;
  cover_image_url: string | null;
  winner_number: number | null;
  winner_name: string | null;
  drawn_at: string | null;
  numbers_hash: string | null;
}

/**
 * Solo el primer nombre y la inicial del apellido: el muro es público, así que
 * el apellido completo nunca sale del servidor.
 */
function shortWinnerName(
  fullName: string | null,
  anonymousLabel: string,
): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return anonymousLabel;

  const first = parts[0];
  if (parts.length === 1) return first;

  const initial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${initial}.`;
}

export default async function GanadoresPage() {
  const t = await getTranslations("Ganadores");
  const tc = await getTranslations("Common");
  const locale = await getLocale();
  const supabase = createClient();

  const { data: raffles } = await supabase
    .from("raffles")
    .select(
      "id, title, cover_image_url, winner_number, winner_name, drawn_at, numbers_hash",
    )
    .eq("status", "drawn")
    // Los sorteos internos no se publicitan ni siquiera cuando se sortean (0079).
    .eq("is_listed", true)
    .order("drawn_at", { ascending: false })
    .limit(60);

  const list = (raffles ?? []) as DrawnRaffle[];

  // Foto del premio: se usa la del primer premio cargado y, si no hay, la
  // portada del sorteo.
  const prizeImageByRaffle = new Map<string, string>();
  if (list.length > 0) {
    const { data: prizes } = await supabase
      .from("prizes")
      .select("raffle_id, image_url, position")
      .in(
        "raffle_id",
        list.map((raffle) => raffle.id),
      )
      .order("position", { ascending: true });

    for (const prize of prizes ?? []) {
      if (prize.image_url && !prizeImageByRaffle.has(prize.raffle_id)) {
        prizeImageByRaffle.set(prize.raffle_id, prize.image_url);
      }
    }
  }

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-hairline pb-8">
        <div className="space-y-4">
          <p className="flex items-center gap-2">
            <Trophy className="h-3.5 w-3.5 text-brand-accent" aria-hidden="true" />
            <span className="eyebrow-gold">{t("eyebrow")}</span>
          </p>
          <h1 className="font-display text-[2.2rem] font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">
            {t("title")}
          </h1>
          <p className="max-w-xl text-[13px] leading-relaxed text-fg-subtle">
            {t("description")}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-3xl font-medium tracking-tight text-fg">
            {String(list.length).padStart(2, "0")}
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
            {t("drawnCount")}
          </p>
        </div>
      </header>

      {list.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <LocaleLink
              href="/#sorteos"
              className={cn(buttonVariants(), "mt-2")}
            >
              {t("seeActiveRaffles")}
            </LocaleLink>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((raffle) => {
            const image =
              prizeImageByRaffle.get(raffle.id) ?? raffle.cover_image_url;

            return (
              <article
                key={raffle.id}
                className="group flex flex-col overflow-hidden rounded-xl border border-hairline bg-panel-1 transition-colors hover:border-hairline-strong"
              >
                <div className="relative aspect-[16/10] border-b border-hairline bg-panel-2">
                  {image ? (
                    <Image
                      src={image}
                      alt={raffle.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1 bg-panel-2">
                      <Gift
                        className="h-6 w-6 text-fg-subtle"
                        aria-hidden="true"
                      />
                      <span className="eyebrow">{t("prizeDelivered")}</span>
                    </div>
                  )}
                  <span className="absolute left-3 top-3">
                    <Badge variant="success" className="bg-canvas/85 ring-1 ring-emerald-500/20">
                      {tc("status.drawn")}
                    </Badge>
                  </span>
                  {raffle.numbers_hash && (
                    <span className="absolute right-3 top-3">
                      <Badge variant="secondary" className="bg-canvas/85 ring-1 ring-hairline">
                        <BadgeCheck className="h-3 w-3" />
                        {tc("verified")}
                      </Badge>
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <h2 className="font-display text-[17px] font-semibold leading-snug tracking-tight">
                      {raffle.title}
                    </h2>
                    {raffle.drawn_at && (
                      <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
                        {formatDateTime(raffle.drawn_at, locale)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-end justify-between gap-3 rounded-lg border border-brand-500/20 bg-brand-500/[0.06] p-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-subtle">
                        {tc("winner")}
                      </p>
                      <p className="truncate text-[13px] font-medium">
                        {shortWinnerName(
                          raffle.winner_name,
                          tc("anonymousWinner"),
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-subtle">
                        {tc("number")}
                      </p>
                      <p className="font-mono text-2xl font-medium text-brand-accent">
                        {raffle.winner_number != null
                          ? formatNumber(raffle.winner_number)
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-auto flex gap-2 pt-1">
                    <LocaleLink
                      href={`/sorteos/${raffle.id}`}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "flex-1",
                      )}
                    >
                      {t("seeRaffle")}
                    </LocaleLink>
                    <LocaleLink
                      href={`/sorteos/${raffle.id}/verificar`}
                      className={cn(buttonVariants({ size: "sm" }), "flex-1")}
                    >
                      {t("verify")}
                    </LocaleLink>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="border-t border-hairline pt-6 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
        {t("footerNote")}
      </p>
    </div>
  );
}
