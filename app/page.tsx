import Link from "next/link";
import { Coins, Gift, ShieldCheck, Trophy, Users } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { HowItWorks } from "@/components/HowItWorks";
import { LiveFomo } from "@/components/LiveFomo";
import { RafflesList } from "@/components/RafflesList";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-800 to-amber-950 px-6 py-16 text-white shadow-xl sm:px-12 sm:py-20">
        <Gift className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 text-white/5" />
        <Trophy className="pointer-events-none absolute bottom-6 right-8 hidden h-24 w-24 text-white/10 sm:block" />

        <div className="relative max-w-2xl space-y-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
            <ShieldCheck className="h-4 w-4" />
            Sorteos 100% online y transparentes
          </span>

          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            ¡Participá y ganá los mejores premios!
          </h1>

          <p className="text-lg text-zinc-300">
            Elegí tus números, pagá por transferencia y enviá el comprobante por
            WhatsApp. Participá por autos, tecnología, experiencias, herramientas
            y mucho más. Transparente de punta a punta: números, premios y
            ganadores a la vista.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/#sorteos"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700",
              )}
            >
              Ver sorteos activos
            </Link>
            {user ? (
              <Link
                href="/mis-numeros"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                })}
              >
                Mis números
              </Link>
            ) : (
              <Link
                href="/register"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                })}
              >
                Crear cuenta
              </Link>
            )}
            <Link
              href="/planes"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Ver planes
            </Link>
          </div>
        </div>
      </section>

      {/* Prueba social: números reales, no inventados. */}
      <section className="grid gap-3 sm:grid-cols-3">
        {trustStats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition hover:border-amber-500/50 hover:shadow-md"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <stat.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xl font-bold tabular-nums">
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
      <RafflesList raffles={(raffles ?? []) as Raffle[]} />

      {/* Avisos de compras recientes (solo título del sorteo y cantidad). */}
      <LiveFomo />
    </div>
  );
}
