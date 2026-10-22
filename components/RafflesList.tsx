"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CalendarDays, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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

type Filter = "all" | "active" | "finished";

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
  { key: "finished", label: "Finalizados" },
];

export function RafflesList({ raffles }: { raffles: Raffle[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return raffles.filter((r) => {
      if (filter === "active" && r.status !== "active") return false;
      if (filter === "finished" && r.status === "active") return false;
      if (q && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [raffles, filter, query]);

  return (
    <section id="sorteos" className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-tight">Sorteos</h2>
        <p className="mt-2 text-muted-foreground">
          Elegí el que más te guste y asegurá tus números.
        </p>
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
                  ? "bg-amber-500 text-white"
                  : "border border-slate-300 text-muted-foreground hover:bg-accent hover:text-foreground dark:border-slate-700",
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
        <Card className="mx-auto max-w-md border-dashed text-center">
          <CardContent className="py-12 text-muted-foreground">
            No se encontraron sorteos para tu búsqueda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((raffle) => (
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

              <CardFooter className="gap-2">
                <Link
                  href={`/sorteos/${raffle.id}`}
                  className={cn(buttonVariants(), "flex-1")}
                >
                  Participar
                </Link>
                <ShareButton sorteoId={raffle.id} titulo={raffle.title} />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
