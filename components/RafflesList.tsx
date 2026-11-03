"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Search, Ticket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ShareButton } from "@/components/ShareButton";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, formatDateTime, formatPrice } from "@/lib/utils";
import type { Raffle } from "@/lib/types";

type Filter = "all" | "active" | "closed" | "drawn";

export interface RaffleStats {
  sold: number;
  total: number;
}

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

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "closed", label: "Cerrados" },
  { key: "drawn", label: "Sorteados" },
];

export function RafflesList({
  raffles,
  stats = {},
}: {
  raffles: Raffle[];
  stats?: Record<string, RaffleStats>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return raffles.filter((r) => {
      if (filter === "active" && r.status !== "active") return false;
      if (filter === "closed" && r.status !== "closed") return false;
      if (filter === "drawn" && r.status !== "drawn") return false;
      if (q && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [raffles, filter, query]);

  return (
    <section id="sorteos" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-brand-700 dark:text-brand-300">
            Cartelera
          </p>
          <h2 className="mt-1 font-display text-3xl font-bold tracking-tight">
            Sorteos
          </h2>
          <p className="mt-1 text-muted-foreground">
            Elegí el que más te guste y asegurá tus números.
          </p>
        </div>
        <Link
          href="/ganadores"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          Ver ganadores
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Filtros + búsqueda */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition",
                filter === f.key
                  ? "bg-brand-500 text-ink shadow-soft"
                  : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título…"
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No encontramos sorteos"
          description="Probá con otro filtro o buscá por título."
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((raffle) => {
            const raffleStat = stats[raffle.id];
            const percent =
              raffleStat && raffleStat.total > 0
                ? Math.min(
                    100,
                    Math.round((raffleStat.sold / raffleStat.total) * 100),
                  )
                : 0;

            return (
              <Card
                key={raffle.id}
                className="group flex flex-col overflow-hidden border-border transition hover:-translate-y-1 hover:border-brand-500/60 hover:shadow-card"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                  {raffle.cover_image_url ? (
                    <Image
                      src={raffle.cover_image_url}
                      alt={raffle.title}
                      fill
                      sizes="(max-width: 640px) 100vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl">
                      🛠️
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-ink/80 to-transparent" />
                  <Badge
                    variant={statusVariant[raffle.status]}
                    className="absolute right-3 top-3"
                  >
                    {statusLabel[raffle.status]}
                  </Badge>
                  <span className="absolute bottom-3 left-3 rounded-full bg-ink/70 px-2.5 py-1 text-xs font-medium text-white/80">
                    {raffle.auto_draw ? "Automático" : "Manual"}
                  </span>
                </div>

                <CardHeader className="pb-2">
                  <CardTitle className="line-clamp-2 text-lg">
                    {raffle.title}
                  </CardTitle>
                </CardHeader>

                <CardContent className="flex-1 space-y-3 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 shrink-0" />
                    {formatDateTime(raffle.draw_date)}
                  </p>
                  <p className="font-display text-lg font-semibold text-foreground">
                    {formatPrice(Number(raffle.price_per_number))}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      por número
                    </span>
                  </p>

                  {raffleStat && raffleStat.total > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span>
                          {raffleStat.sold} de {raffleStat.total} vendidos
                        </span>
                        <span className="font-mono font-semibold text-foreground">
                          {percent}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="gap-2">
                  <Link
                    href={
                      raffle.status === "drawn"
                        ? `/sorteos/${raffle.id}/verificar`
                        : `/sorteos/${raffle.id}`
                    }
                    className={cn(buttonVariants(), "flex-1")}
                  >
                    {raffle.status === "drawn" ? (
                      "Ver resultado"
                    ) : raffle.status === "closed" ? (
                      "Ver detalles"
                    ) : (
                      <>
                        <Ticket className="mr-1.5 h-4 w-4" />
                        Participar
                      </>
                    )}
                  </Link>
                  <ShareButton sorteoId={raffle.id} titulo={raffle.title} />
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
