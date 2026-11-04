import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Gift,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { HowItWorks } from "@/components/HowItWorks";
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

function statusBadge(
  status: Raffle["status"],
): { label: string; variant: "success" | "warning" | "secondary" } {
  if (status === "active") return { label: "Activo", variant: "success" };
  if (status === "closed") return { label: "Cerrado", variant: "warning" };
  if (status === "drawn") return { label: "Sorteado", variant: "secondary" };
  return { label: "Cancelado", variant: "secondary" };
}

/**
 * Módulo del sorteo destacado: el "ticket" real del hero. Usa datos reales
 * (precio, fecha, progreso y si el compromiso ya está publicado). Sin mocks.
 */
function FeaturedTicket({
  raffle,
  stats,
}: {
  raffle: Raffle;
  stats?: RaffleStats;
}) {
  const percent = rafflePercent(stats);
  const status = statusBadge(raffle.status);

  return (
    <Link
      href={`/sorteos/${raffle.id}`}
      className="group block overflow-hidden rounded-xl border border-hairline bg-panel-1 transition-colors hover:border-hairline-strong"
    >
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
        <span className="eyebrow-gold">Sorteo destacado</span>
        <Badge variant="success">
          <ShieldCheck className="h-3 w-3" />
          {raffle.draw_commitment ? "Compromiso publicado" : "Verificable"}
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
            <span className="eyebrow">Premio en juego</span>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
          <Badge variant={status.variant} className="bg-canvas/85 ring-1 ring-emerald-500/20">{status.label}</Badge>
          <span className="rounded-md bg-canvas/80 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted ring-1 ring-hairline">
            {raffle.auto_draw ? "Automático" : "Manual"}
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
              Por número
            </p>
            <p className="font-mono text-lg text-fg">
              {formatPrice(Number(raffle.price_per_number))}
            </p>
          </div>
          {stats && stats.total > 0 && (
            <p className="font-mono text-[12px] text-fg-subtle">
              {stats.sold.toLocaleString("es-AR")} de{" "}
              {stats.total.toLocaleString("es-AR")} · {percent}%
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
            ? `compromiso ${String(raffle.draw_commitment).slice(0, 12)}…`
            : "huella publicada al sortear"}
        </p>

        <div className="ticket-stub -mx-4 flex items-center justify-between px-4 pt-3">
          <span className="text-[13px] font-medium text-fg-muted">
            Elegí tus números
          </span>
          <ArrowRight
            className="h-4 w-4 text-brand-accent transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
      </div>
    </Link>
  );
}

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: raffles } = await supabase
    .from("raffles")
    .select("*")
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

  const featured =
    raffleList.find((raffle) => raffle.status === "active") ??
    raffleList[0] ??
    null;
  const featuredStats = featured ? raffleStats[featured.id] : undefined;

  const platformStats = [
    {
      icon: Ticket,
      value: String(activeCount).padStart(2, "0"),
      label: "sorteos activos",
    },
    {
      icon: Users,
      value: String(organizerCount ?? 0).padStart(2, "0"),
      label: "organizadores",
    },
    {
      icon: ShieldCheck,
      value: "SHA-256",
      label: "huella por resultado",
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
        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:pb-24">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="min-w-0 max-w-2xl">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="eyebrow">Sorteos verificables · Argentina</span>
                <span className="hidden h-px w-8 bg-hairline-strong sm:block" />
                <span className="hidden font-mono text-[11px] text-fg-subtle sm:inline">
                  hash público
                </span>
              </p>

              <h1 className="mt-5 text-balance font-display text-[2.7rem] font-semibold leading-[0.98] tracking-[-0.035em] sm:text-6xl lg:text-[4.2rem]">
                Sorteos que se pueden{" "}
                <span className="text-brand-accent">verificar.</span>
              </h1>

              <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-fg-muted sm:text-base">
                Elegí tus números, pagá por transferencia y seguí el sorteo en
                vivo. Cada resultado queda con su hash: nadie puede cambiarlo
                después.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/#sorteos"
                  className={cn(buttonVariants({ size: "lg" }), "group")}
                >
                  Ver sorteos activos
                  <ArrowRight
                    className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
                <Link
                  href="/como-funciona"
                  className="btn-ghost-strong"
                >
                  Cómo funciona
                </Link>
              </div>

              <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
                Transferencia · comprobante por WhatsApp · resultado con hash
              </p>

              {/* Versión compacta del destacado en móvil. */}
              {featured && (
                <Link
                  href={`/sorteos/${featured.id}`}
                  className="group mt-8 flex items-center gap-3 rounded-xl border border-hairline bg-panel-1 p-3 transition-colors hover:border-hairline-strong lg:hidden"
                >
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-panel-2">
                    {featured.cover_image_url ? (
                      <Image
                        src={featured.cover_image_url}
                        alt={featured.title}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center">
                        <Gift className="h-5 w-5 text-fg-subtle" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {featured.title}
                    </p>
                    <p className="font-mono text-[12px] text-fg-subtle">
                      {featuredStats
                        ? `${featuredStats.sold} de ${featuredStats.total} vendidos`
                        : "Sorteo activo"}{" "}
                      · {formatPrice(Number(featured.price_per_number))}
                    </p>
                  </div>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-brand-accent"
                    aria-hidden="true"
                  />
                </Link>
              )}

              <p className="mt-4 text-[13px] text-fg-subtle">
                {user ? (
                  <Link
                    href="/mis-numeros"
                    className="text-fg-muted underline-offset-4 hover:text-fg hover:underline"
                  >
                    Ver mis números
                  </Link>
                ) : (
                  <>
                    ¿Organizás sorteos?{" "}
                    <Link
                      href="/planes"
                      className="text-brand-accent underline-offset-4 hover:underline"
                    >
                      Conocé los planes
                    </Link>
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
                    El próximo sorteo se publica pronto
                  </p>
                  <p className="mt-1 text-sm text-fg-subtle">
                    Mientras tanto, conocé cómo funciona o publicá el tuyo.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-20 pt-10 sm:space-y-24 sm:pt-12">
        {/* ============ ESTADO DE LA PLATAFORMA ============ */}
        <section
          aria-label="Estado de la plataforma"
          className="grid divide-y divide-hairline border-y border-hairline sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        >
          {platformStats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-baseline gap-4 px-1 py-6 sm:px-6"
            >
              <stat.icon
                className="h-4 w-4 shrink-0 translate-y-0.5 text-fg-subtle"
                aria-hidden="true"
              />
              <div className="flex flex-wrap items-baseline gap-x-3">
                <p className="font-mono text-2xl font-medium tracking-tight text-fg">
                  {stat.value}
                </p>
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-subtle">
                  {stat.label}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* ============ PROTOCOLO ============ */}
        <HowItWorks />

        {/* ============ CARTELERA ============ */}
        <RafflesList
          raffles={raffleList.filter((raffle) => raffle.id !== featured?.id)}
          stats={raffleStats}
        />
      </div>

      {/* Avisos de compras recientes (solo título del sorteo y cantidad). */}
      <LiveFomo />
    </div>
  );
}
