"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Gift, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ShareButton } from "@/components/ShareButton";
import { buttonVariants } from "@/components/ui/button";
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
  cancelled: "Cancelado",
  paused: "Pausado",
};

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
    <section id="sorteos" className="scroll-mt-20 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Cartelera</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Sorteos en juego
          </h2>
          <p className="mt-2 text-[13px] text-fg-subtle">
            Elegí el que más te guste y asegurá tus números antes de que se
            agoten.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[12px] text-fg-subtle">
            {filtered.length.toLocaleString("es-AR")} de{" "}
            {raffles.length.toLocaleString("es-AR")}
          </span>
          <Link
            href="/ganadores"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
          >
            Ver ganadores
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* Filtros + búsqueda: una sola barra de herramienta. */}
      <div className="flex flex-col gap-3 border-y border-hairline py-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="grid w-full grid-cols-4 gap-0.5 rounded-lg border border-hairline bg-panel-1 p-1 sm:inline-flex sm:w-auto"
          role="group"
          aria-label="Filtrar sorteos por estado"
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-[13px]",
                  active
                    ? "bg-panel-3 text-fg"
                    : "text-fg-subtle hover:text-fg",
                )}
              >
                {active && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-brand-500"
                    aria-hidden="true"
                  />
                )}
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título…"
            aria-label="Buscar sorteos por título"
            className="h-9 pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No encontramos sorteos"
          description="Probá con otro filtro o buscá por título."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((raffle) => {
            const raffleStat = stats[raffle.id];
            const percent =
              raffleStat && raffleStat.total > 0
                ? Math.min(
                    100,
                    Math.round((raffleStat.sold / raffleStat.total) * 100),
                  )
                : 0;

            const isActive = raffle.status === "active";
            const detailHref =
              raffle.status === "drawn"
                ? `/sorteos/${raffle.id}/verificar`
                : `/sorteos/${raffle.id}`;

            return (
              <article
                key={raffle.id}
                className="group flex flex-col overflow-hidden rounded-xl border border-hairline bg-panel-1 transition-colors hover:border-hairline-strong"
              >
                <Link
                  href={detailHref}
                  className="relative block aspect-[16/10] overflow-hidden border-b border-hairline bg-panel-2"
                  aria-label={`Ver ${raffle.title}`}
                >
                  {raffle.cover_image_url ? (
                    <Image
                      src={raffle.cover_image_url}
                      alt={raffle.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1 bg-panel-2">
                      <Gift
                        className="h-6 w-6 text-fg-subtle"
                        aria-hidden="true"
                      />
                      <span className="eyebrow">Premio en juego</span>
                    </div>
                  )}
                  <span className="absolute left-3 top-3">
                    <Badge variant={statusVariant[raffle.status]} className="bg-canvas/85">
                      {statusLabel[raffle.status]}
                    </Badge>
                  </span>
                  <span className="absolute right-3 top-3 rounded-md bg-canvas/80 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted ring-1 ring-hairline">
                    {raffle.auto_draw ? "Automático" : "Manual"}
                  </span>
                </Link>

                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-display text-[17px] font-semibold leading-snug tracking-tight">
                        <Link
                          href={detailHref}
                          className="underline-offset-4 hover:underline"
                        >
                          {raffle.title}
                        </Link>
                      </h3>
                      {raffle.is_featured && raffle.status === "active" && (
                        <span className="mt-1.5 inline-flex rounded-full bg-brand-500/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-brand-accent">
                          Destacado
                        </span>
                      )}
                      <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[12px] text-fg-subtle">
                        <CalendarDays
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        {formatDateTime(raffle.draw_date)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-2">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
                        Por número
                      </p>
                      <p className="font-mono text-[17px] text-fg">
                        {formatPrice(Number(raffle.price_per_number))}
                      </p>
                    </div>
                    {raffleStat && raffleStat.total > 0 && (
                      <p className="font-mono text-[12px] text-fg-subtle">
                        {raffleStat.sold.toLocaleString("es-AR")} de{" "}
                        {raffleStat.total.toLocaleString("es-AR")} · {percent}%
                      </p>
                    )}
                  </div>

                  <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-panel-3">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <div className="ticket-stub -mx-5 mt-auto flex items-center gap-2 px-5 pt-3">
                    <Link
                      href={detailHref}
                      className={cn(
                        buttonVariants({
                          variant: "outline",
                          size: "sm",
                        }),
                        "h-9 flex-1 text-[13px]",
                      )}
                    >
                      {raffle.status === "drawn"
                        ? "Ver resultado"
                        : isActive
                          ? "Participar"
                          : "Ver detalles"}
                      <ArrowRight
                        className="ml-1.5 h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    </Link>
                    <ShareButton
                      sorteoId={raffle.id}
                      titulo={raffle.title}
                      compact
                      className="h-9 w-9 shrink-0 px-0"
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
