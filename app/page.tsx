import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Coins,
  Gift,
  ShieldCheck,
  Ticket,
  Trophy,
  Users,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { HowItWorks } from "@/components/HowItWorks";
import { LiveFomo } from "@/components/LiveFomo";
import { RafflesList } from "@/components/RafflesList";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatDateTime, formatPrice } from "@/lib/utils";
import type { Raffle } from "@/lib/types";

export const dynamic = "force-dynamic";

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
  const drawnCount = raffleList.filter((r) => r.status === "drawn").length;

  const [{ count: soldCount }, { count: organizerCount }] = await Promise.all([
    supabase
      .from("raffle_numbers")
      .select("*", { count: "exact", head: true })
      .eq("status", "sold"),
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

      return [
        raffle.id,
        { sold: sold ?? 0, total: total ?? 0 },
      ] as const;
    }),
  );

  const raffleStats = Object.fromEntries(statsEntries);

  const featured =
    raffleList.find((raffle) => raffle.status === "active") ??
    raffleList[0] ??
    null;
  const featuredStats = featured ? raffleStats[featured.id] : undefined;
  const featuredPercent =
    featuredStats && featuredStats.total > 0
      ? Math.min(
          100,
          Math.round((featuredStats.sold / featuredStats.total) * 100),
        )
      : 0;

  const trustStats = [
    {
      icon: Coins,
      value: soldCount ?? 0,
      label: "números vendidos",
      href: "/#sorteos",
    },
    {
      icon: Trophy,
      value: drawnCount,
      label: "sorteos sorteados",
      href: "/ganadores",
    },
    {
      icon: Users,
      value: organizerCount ?? 0,
      label: "organizadores",
      href: "/planes",
    },
  ];

  return (
    <div className="space-y-16">
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden rounded-3xl bg-ink text-white shadow-card">
        <div className="pointer-events-none absolute inset-0 blueprint-grid opacity-60" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />

        <div className="relative grid gap-10 px-6 py-12 sm:px-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-16">
          <div className="min-w-0 max-w-2xl space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/40 bg-brand-400/10 px-3 py-1 text-xs font-medium text-brand-200">
              <ShieldCheck className="h-4 w-4" />
              Herramientas · premios · transparencia
            </span>

            <h1 className="break-words text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Sorteos que se pueden{" "}
              <span className="text-brand-400">verificar.</span>
            </h1>

            <p className="max-w-xl text-lg leading-relaxed text-white/70">
              Herramientas, premios y experiencias. Elegí tus números, pagá por
              transferencia y seguí el sorteo en vivo: cada resultado se puede
              comprobar con su hash.
            </p>

            <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/#sorteos"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "group w-full justify-center sm:w-auto",
                )}
              >
                Ver sorteos activos
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/como-funciona"
                className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-white/20 bg-white/5 px-6 text-base font-semibold text-white transition hover:bg-white/10 sm:w-auto"
              >
                Cómo funciona
              </Link>
            </div>

            <p className="text-sm text-white/50">
              {user ? (
                <Link href="/mis-numeros" className="hover:text-white">
                  Ver mis números
                </Link>
              ) : (
                <>
                  ¿Organizás sorteos?{" "}
                  <Link href="/planes" className="text-brand-300 hover:underline">
                    Conocé los planes
                  </Link>
                </>
              )}
            </p>

            {/* Preview móvil del sorteo destacado */}
            {featured && (
              <Link
                href={`/sorteos/${featured.id}`}
                className="group mt-2 block w-full min-w-0 rounded-2xl border border-white/15 bg-white/5 p-3 transition hover:border-brand-400/60 lg:hidden"
              >
                <div className="flex items-center gap-3">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-ink-soft">
                    {featured.cover_image_url ? (
                      <Image
                        src={featured.cover_image_url}
                        alt={featured.title}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-2xl">
                        🛠️
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {featured.title}
                    </p>
                    <p className="text-xs text-white/60">
                      {featuredStats
                        ? `${featuredStats.sold} de ${featuredStats.total} vendidos`
                        : "Sorteo activo"}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-brand-400" />
                </div>
              </Link>
            )}
          </div>

          {/* Tablero visual: sorteo real, no un mockup inventado. */}
          <div className="hidden lg:block">
            {featured ? (
              <Link
                href={`/sorteos/${featured.id}`}
                className="group block rotate-1 rounded-2xl border border-white/15 bg-white/5 p-3 backdrop-blur transition hover:rotate-0 hover:border-brand-400/60"
              >
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-ink-soft">
                  {featured.cover_image_url ? (
                    <Image
                      src={featured.cover_image_url}
                      alt={featured.title}
                      fill
                      sizes="(max-width: 1024px) 0px, 480px"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-6xl">
                      🛠️
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink/90 to-transparent" />
                  <span className="absolute left-3 top-3">
                    <Badge className="border-transparent bg-brand-500 text-ink">
                      <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                      Verificable
                    </Badge>
                  </span>
                  <span className="absolute bottom-3 left-3 rounded-full bg-ink/70 px-2.5 py-1 text-xs font-medium text-white/80">
                    {featured.auto_draw
                      ? "Sorteo automático"
                      : "Sorteo manual"}
                  </span>
                </div>

                <div className="space-y-3 p-3">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-brand-300">
                      Sorteo destacado
                    </p>
                    <p className="mt-1 truncate font-display text-xl font-semibold">
                      {featured.title}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-sm text-white/60">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-4 w-4" />
                      {formatDateTime(featured.draw_date)}
                    </span>
                    <span className="font-semibold text-white">
                      {formatPrice(Number(featured.price_per_number))}
                    </span>
                  </div>

                  {featuredStats && featuredStats.total > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-white/60">
                        <span>
                          {featuredStats.sold} de {featuredStats.total} vendidos
                        </span>
                        <span>{featuredPercent}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${featuredPercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-white/10 pt-3 text-sm">
                    <span className="flex items-center gap-1.5 text-white/60">
                      <Ticket className="h-4 w-4" />
                      Elegí tus números
                    </span>
                    <ArrowRight className="h-4 w-4 text-brand-400 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            ) : (
              <div className="rounded-2xl border border-white/15 bg-white/5 p-8 text-center">
                <Gift className="mx-auto h-10 w-10 text-brand-400" />
                <p className="mt-3 font-display text-lg font-semibold">
                  El próximo sorteo se publica pronto
                </p>
                <p className="mt-1 text-sm text-white/60">
                  Mientras tanto, conocé cómo funciona o publicá el tuyo.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Prueba social: números reales, no inventados. */}
      <section className="grid gap-3 sm:grid-cols-3">
        {trustStats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-soft transition hover:border-brand-500/50 hover:shadow-card"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-700 dark:text-brand-300">
              <stat.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-2xl font-bold tabular-nums">
                {stat.value.toLocaleString("es-AR")}
              </p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          </Link>
        ))}
      </section>

      {/* ============ CÓMO FUNCIONA (colapsable) ============ */}
      <HowItWorks />

      {/* ============ SORTEOS (filtros + búsqueda) ============ */}
      <RafflesList raffles={raffleList} stats={raffleStats} />

      {/* Avisos de compras recientes (solo título del sorteo y cantidad). */}
      <LiveFomo />
    </div>
  );
}
