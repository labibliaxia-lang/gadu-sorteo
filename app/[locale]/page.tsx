import Image from "next/image";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import {
  ArrowRight,
  CalendarDays,
  Gift,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { pickFeatured, sortFeaturedFirst } from "@/lib/featured";
import { ProtocolSection } from "@/components/ProtocolSection";
import { LiveFomo } from "@/components/LiveFomo";
import { PageViewTracker } from "@/components/PageViewTracker";
import { RafflesList } from "@/components/RafflesList";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatDateTime, formatPrice } from "@/lib/utils";
import type { Raffle } from "@/lib/types";

export const dynamic = "force-dynamic";

type RaffleStats = { sold: number; total: number };

function rafflePercent(stats?: RaffleStats): number {
  if (!stats || stats.total <= 0) return 0;
  return Math.min(100, Math.round((stats.sold / stats.total) * 100));
}

function statusVariant(
  status: Raffle["status"],
): "success" | "warning" | "secondary" {
  if (status === "active") return "success";
  if (status === "closed") return "warning";
  return "secondary";
}

/**
 * Módulo del sorteo destacado: el "ticket" real del hero. Usa datos reales
 * (precio, fecha, progreso y si el compromiso ya está publicado). Sin mocks.
 */
async function FeaturedTicket({
  raffle,
  stats,
}: {
  raffle: Raffle;
  stats?: RaffleStats;
}) {
  const t = await getTranslations("Home");
  const tc = await getTranslations("Common");
  const percent = rafflePercent(stats);
  const statusLabel = tc(`status.${raffle.status}`);
  const status = statusVariant(raffle.status);

  return (
    <LocaleLink
      href={`/sorteos/${raffle.id}`}
      className="group block overflow-hidden rounded-xl border border-hairline bg-panel-1 transition-colors hover:border-hairline-strong"
    >
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
        <span className="eyebrow-gold">{t("featured")}</span>
        <Badge variant="success">
          <ShieldCheck className="h-3 w-3" />
          {raffle.draw_commitment
            ? t("commitmentPublished")
            : t("verifiable")}
        </Badge>
      </div>

      <div className="relative aspect-[16/10] overflow-hidden border-b border-hairline bg-panel-2">
        {raffle.cover_image_url ? (
          <Image
            src={raffle.cover_image_url}
            alt={raffle.title}
            fill
            sizes="(max-width: 1024px) 100vw, 460px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1">
            <Gift className="h-7 w-7 text-fg-subtle" aria-hidden="true" />
            <span className="eyebrow">{t("prizeInPlay")}</span>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
          <Badge variant={status} className="bg-canvas/85">{statusLabel}</Badge>
          <span className="rounded-md bg-canvas/80 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted ring-1 ring-hairline">
            {raffle.auto_draw ? tc("automatic") : tc("manual")}
          </span>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="space-y-1">
          <h2 className="line-clamp-1 font-display text-xl font-semibold tracking-tight">
            {raffle.title}
          </h2>
          <p className="flex items-center gap-1.5 font-mono text-[12px] text-fg-subtle">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {formatDateTime(raffle.draw_date)}
          </p>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
              {tc("perNumber")}
            </p>
            <p className="font-mono text-lg text-fg">
              {formatPrice(Number(raffle.price_per_number))}
            </p>
          </div>
          {stats && stats.total > 0 && (
            <p className="font-mono text-[12px] text-fg-subtle">
              {tc("soldOfTotal", {
                sold: stats.sold.toLocaleString("es-AR"),
                total: stats.total.toLocaleString("es-AR"),
                percent,
              })}
            </p>
          )}
        </div>

        <div className="h-0.5 overflow-hidden rounded-full bg-panel-3">
          <div
            className="h-full rounded-full bg-brand-500"
            style={{ width: `${percent}%` }}
          />
        </div>

        <p className="flex items-center gap-1.5 font-mono text-[11px] text-fg-subtle">
          <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
          {raffle.draw_commitment
            ? t("commitmentHash", {
                hash: String(raffle.draw_commitment).slice(0, 12),
              })
            : t("fingerprintPublished")}
        </p>

        <div className="ticket-stub -mx-4 flex items-center justify-between px-4 pt-3">
          <span className="text-[13px] font-medium text-fg-muted">
            {t("chooseMyNumbers")}
          </span>
          <ArrowRight
            className="h-4 w-4 text-brand-accent transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
      </div>
    </LocaleLink>
  );
}

export default async function HomePage() {
  const t = await getTranslations("Home");
  const tc = await getTranslations("Common");
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: raffles } = await supabase
    .from("raffles")
    .select("*")
    // `is_listed = false` es para sorteos internos: existen y se pueden abrir
    // por enlace, pero no se publicitan (0079).
    .eq("is_listed", true)
    .order("created_at", { ascending: false });

  const raffleList = (raffles ?? []) as Raffle[];
  const activeCount = raffleList.filter((r) => r.status === "active").length;

  const [{ count: organizerCount }] = await Promise.all([
    supabase
      .from("public_organizers")
      .select("*", { count: "exact", head: true }),
  ]);

  // Progreso por sorteo: vendidos y total generado. Se limita a los primeros
  // 24 para no disparar decenas de consultas en la home.
  const statRaffles = raffleList.slice(0, 24);
  const statsEntries = await Promise.all(
    statRaffles.map(async (raffle) => {
      const [{ count: sold }, { count: total }] = await Promise.all([
        supabase
          .from("raffle_numbers")
          .select("*", { count: "exact", head: true })
          .eq("raffle_id", raffle.id)
          .eq("status", "sold"),
        supabase
          .from("raffle_numbers")
          .select("*", { count: "exact", head: true })
          .eq("raffle_id", raffle.id),
      ]);

      return [raffle.id, { sold: sold ?? 0, total: total ?? 0 }] as const;
    }),
  );

  const raffleStats = Object.fromEntries(statsEntries);

  // Destacado único (decisión 2026-11-04): lo marca el superadmin con
  // `is_featured`. El hero usa el último destacado activo; si no hay ninguno,
  // cae al primer activo como antes.
  const featured = pickFeatured(raffleList);

  // En la cartelera, el destacado activo va primero (el hero ya muestra uno).
  const listedRaffles = sortFeaturedFirst(
    raffleList.filter((raffle) => raffle.id !== featured?.id),
  );
  const featuredStats = featured ? raffleStats[featured.id] : undefined;
  const featuredPercent = rafflePercent(featuredStats);

  const platformStats = [
    {
      icon: Ticket,
      value: String(activeCount).padStart(2, "0"),
      label: t("activeRaffles"),
    },
    {
      icon: Users,
      value: String(organizerCount ?? 0).padStart(2, "0"),
      label: t("organizers"),
    },
    {
      icon: ShieldCheck,
      value: "SHA-256",
      label: t("fingerprintPerResult"),
    },
  ];

  return (
    <div>
      <PageViewTracker path="/" />

      {/* ============ HERO full-bleed ============ */}
      <section className="full-bleed relative -mt-6 border-b border-hairline sm:-mt-8">
        <div
          aria-hidden="true"
          className="hairline-grid pointer-events-none absolute inset-0"
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pb-20 sm:pt-16 lg:pb-24">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="min-w-0 max-w-2xl">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="eyebrow">{t("heroEyebrow")}</span>
                <span className="hidden h-px w-8 bg-hairline-strong sm:block" />
                <span className="hidden font-mono text-[11px] text-fg-subtle sm:inline">
                  {t("publicHash")}
                </span>
              </p>

              <h1 className="mt-4 text-balance font-display text-[2.7rem] font-semibold leading-[0.98] tracking-[-0.035em] sm:mt-5 sm:text-6xl lg:text-[4.2rem]">
                {t("heroTitle")}{" "}
                <span className="text-brand-accent">
                  {t("heroTitleHighlight")}
                </span>
              </h1>

              <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-fg-muted sm:mt-6 sm:text-base">
                {t("heroDescription")}
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center">
                <LocaleLink
                  href="/#sorteos"
                  className={cn(buttonVariants({ size: "lg" }), "group")}
                >
                  {t("seeActiveRaffles")}
                  <ArrowRight
                    className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </LocaleLink>
                <LocaleLink
                  href="/como-funciona"
                  className="btn-ghost-strong"
                >
                  {t("howItWorks")}
                </LocaleLink>
              </div>

              <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
                {t("heroFootnote")}
              </p>

              {/* Versión móvil del destacado: tarjeta vertical con la imagen
                  a todo el ancho y un CTA grande para tocar con el dedo. */}
              {featured && (
                <LocaleLink
                  href={`/sorteos/${featured.id}`}
                  className="group mt-6 block overflow-hidden rounded-xl border border-hairline bg-panel-1 transition-colors hover:border-hairline-strong lg:hidden"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2">
                    <span className="eyebrow-gold">{t("featured")}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-subtle">
                      {featured.draw_commitment
                        ? t("commitmentPublished")
                        : t("verifiable")}
                    </span>
                  </div>

                  {/* Imagen grande, 100% del ancho. */}
                  <div className="relative aspect-[4/3] w-full overflow-hidden border-b border-hairline bg-panel-2">
                    {featured.cover_image_url ? (
                      <Image
                        src={featured.cover_image_url}
                        alt={featured.title}
                        fill
                        sizes="100vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-1">
                        <Gift
                          className="h-8 w-8 text-fg-subtle"
                          aria-hidden="true"
                        />
                        <span className="eyebrow">{t("prizeInPlay")}</span>
                      </div>
                    )}
                  </div>

                  {/* Contenido debajo de la imagen. */}
                  <div className="space-y-3 p-4">
                    <div className="space-y-1">
                      <h2 className="font-display text-xl font-semibold tracking-tight">
                        {featured.title}
                      </h2>
                      <p className="flex items-center gap-1.5 font-mono text-[12px] text-fg-subtle">
                        <CalendarDays
                          className="h-3.5 w-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        {formatDateTime(featured.draw_date)}
                      </p>
                    </div>

                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
                          {tc("perNumber")}
                        </p>
                        <p className="font-mono text-xl text-fg">
                          {formatPrice(Number(featured.price_per_number))}
                        </p>
                      </div>
                      <p className="text-right font-mono text-[11px] leading-tight text-fg-subtle">
                        {featuredStats
                          ? tc("soldOfTotal", {
                              sold: featuredStats.sold.toLocaleString("es-AR"),
                              total:
                                featuredStats.total.toLocaleString("es-AR"),
                              percent: featuredPercent,
                            })
                          : t("activeRaffle")}
                      </p>
                    </div>

                    <div className="h-1 overflow-hidden rounded-full bg-hairline-strong">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${featuredPercent}%` }}
                      />
                    </div>

                    <span className="flex h-12 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-[15px] font-medium text-primary-foreground transition-colors group-hover:bg-primary-hover">
                      {t("chooseMyNumbers")}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
                </LocaleLink>
              )}

              <p className="mt-3 text-[13px] text-fg-subtle sm:mt-4">
                {user ? (
                  <NextLink
                    href="/mis-numeros"
                    className="text-fg-muted underline-offset-4 hover:text-fg hover:underline"
                  >
                    {t("seeMyNumbers")}
                  </NextLink>
                ) : (
                  <>
                    {t("organizeQuestion")}{" "}
                    <LocaleLink
                      href="/planes"
                      className="text-brand-accent underline-offset-4 hover:underline"
                    >
                      {t("seePlans")}
                    </LocaleLink>
                  </>
                )}
              </p>
            </div>

            {/* Tablero visual: sorteo real, no un mockup inventado. */}
            <div className="hidden lg:block">
              {featured ? (
                <FeaturedTicket raffle={featured} stats={featuredStats} />
              ) : (
                <div className="rounded-xl border border-hairline bg-panel-1 p-8 text-center">
                  <Gift className="mx-auto h-8 w-8 text-brand-accent" />
                  <p className="mt-3 font-display text-lg font-semibold">
                    {t("nextRaffleSoon")}
                  </p>
                  <p className="mt-1 text-sm text-fg-subtle">
                    {t("nextRaffleHint")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-12 pt-8 sm:space-y-24 sm:pt-12">
        {/* ============ ESTADO DE LA PLATAFORMA ============ */}
        <section
          aria-label={t("platformStatus")}
          className="grid grid-cols-3 divide-x divide-hairline border-y border-hairline"
        >
          {platformStats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-1 px-2 py-3 sm:flex-row sm:items-baseline sm:gap-4 sm:px-6 sm:py-6"
            >
              <stat.icon
                className="h-3.5 w-3.5 shrink-0 text-fg-subtle sm:h-4 sm:w-4 sm:translate-y-0.5"
                aria-hidden="true"
              />
              <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3">
                <p className="font-mono text-lg font-medium tracking-tight text-fg sm:text-2xl">
                  {stat.value}
                </p>
                <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-fg-subtle sm:text-[11px] sm:tracking-[0.1em]">
                  {stat.label}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* ============ CARTELERA (primero: prioridad en móvil) ============ */}
        <RafflesList
          raffles={listedRaffles}
          stats={raffleStats}
        />

        {/* ============ PROTOCOLO + DEMO DEL MOTOR ============ */}
        <ProtocolSection />
      </div>

      {/* Avisos de compras recientes (solo título del sorteo y cantidad). */}
      <LiveFomo />
    </div>
  );
}
