import Link from "next/link";
import { Gift, ShieldCheck, Trophy } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { HowItWorks } from "@/components/HowItWorks";
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
            Elegí tus números, pagá de forma segura con Mercado Pago y participá
            por autos, tecnología, experiencias, herramientas y mucho más.
            Transparente de punta a punta: números, premios y ganadores a la
            vista.
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
              Canjear código
            </Link>
          </div>
        </div>
      </section>

      {/* ============ CÓMO FUNCIONA (colapsable) ============ */}
      <HowItWorks />

      {/* ============ SORTEOS (filtros + búsqueda) ============ */}
      <RafflesList raffles={(raffles ?? []) as Raffle[]} />
    </div>
  );
}
