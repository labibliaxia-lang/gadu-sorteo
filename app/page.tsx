import Image from "next/image";
import Link from "next/link";
import {
  CalendarDays,
  ShieldCheck,
  Trophy,
  Wrench,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { HowItWorks } from "@/components/HowItWorks";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn, formatDateTime, formatPrice } from "@/lib/utils";
import type { Raffle } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusLabel: Record<Raffle["status"], string> = {
  active: "Activo",
  closed: "Cerrado",
  drawn: "Sorteado",
};

const statusVariant: Record<
  Raffle["status"],
  "success" | "warning" | "secondary"
> = {
  active: "success",
  closed: "warning",
  drawn: "secondary",
};

export default async function HomePage() {
  const supabase = createClient();
  const { data: raffles } = await supabase
    .from("raffles")
    .select("*")
    .order("created_at", { ascending: false });

  const activeRaffles = (raffles ?? []).filter((r) => r.status === "active");

  return (
    <div className="space-y-16">
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-800 to-amber-950 px-6 py-16 text-white shadow-xl sm:px-12 sm:py-20">
        <Wrench className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 text-white/5" />
        <Trophy className="pointer-events-none absolute bottom-6 right-8 hidden h-24 w-24 text-white/10 sm:block" />

        <div className="relative max-w-2xl space-y-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
            <ShieldCheck className="h-4 w-4" />
            Sorteos 100% online y transparentes
          </span>

          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            ¡Ganá las mejores herramientas para tu taller!
          </h1>

          <p className="text-lg text-zinc-300">
            Elegí tus números, pagá con Mercado Pago y participá por
            herramientas de primera. Simple, seguro y sin vueltas.
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
            <Link
              href="/register"
              className={buttonVariants({
                variant: "outline",
                size: "lg",
              })}
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </section>

      {/* ============ CÓMO FUNCIONA (colapsable) ============ */}
      <HowItWorks />

      {/* ============ SORTEOS ============ */}
      <section id="sorteos" className="space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight">Sorteos activos</h2>
          <p className="mt-2 text-muted-foreground">
            Elegí el que más te guste y asegurá tus números.
          </p>
        </div>

        {activeRaffles.length === 0 ? (
          <Card className="mx-auto max-w-md border-dashed text-center">
            <CardContent className="space-y-4 py-12">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Wrench className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-semibold">
                  Todavía no hay sorteos activos
                </h3>
                <p className="text-sm text-muted-foreground">
                  Estamos preparando nuevas rifas de herramientas. Dejá tu
                  cuenta lista para no perderte el próximo sorteo.
                </p>
              </div>
              <Link href="/register" className={buttonVariants()}>
                Crear cuenta gratis
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {activeRaffles.map((raffle: Raffle) => (
              <Card
                key={raffle.id}
                className="group overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-amber-500/50 hover:shadow-2xl"
              >
                <div className="relative aspect-video w-full bg-muted">
                  {raffle.cover_image_url ? (
                    <Image
                      src={raffle.cover_image_url}
                      alt={raffle.title}
                      fill
                      sizes="(max-width: 640px) 100vw, 33vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl">
                      🛠️
                    </div>
                  )}
                  <Badge
                    variant={statusVariant[raffle.status]}
                    className="absolute right-2 top-2"
                  >
                    {statusLabel[raffle.status]}
                  </Badge>
                </div>

                <CardHeader>
                  <CardTitle className="text-xl">{raffle.title}</CardTitle>
                </CardHeader>

                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    {formatDateTime(raffle.draw_date)}
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatPrice(Number(raffle.price_per_number))}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      por número
                    </span>
                  </p>
                </CardContent>

                <CardFooter>
                  <Link
                    href={`/sorteos/${raffle.id}`}
                    className={cn(buttonVariants(), "w-full")}
                  >
                    Participar
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
