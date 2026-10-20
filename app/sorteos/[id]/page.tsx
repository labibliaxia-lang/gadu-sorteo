import Image from "next/image";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { NumbersGrid } from "@/components/NumbersGrid";
import { OrganizerCard } from "@/components/OrganizerCard";
import { PrizeCard } from "@/components/PrizeCard";
import { formatDateTime, formatPrice } from "@/lib/utils";
import type { Prize, Profile, Raffle } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusLabel: Record<Raffle["status"], string> = {
  active: "Activo",
  closed: "Cerrado",
  drawn: "Sorteado",
};

export default async function RafflePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const isDev = process.env.NODE_ENV === "development";

  const { data: raffle } = await supabase
    .from("raffles")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!raffle) notFound();

  const { data: prizes } = await supabase
    .from("prizes")
    .select("*")
    .eq("raffle_id", params.id)
    .order("position", { ascending: true });

  const { data: organizer } = raffle.created_by
    ? await supabase
        .from("profiles")
        .select("*")
        .eq("id", raffle.created_by)
        .single()
    : { data: null };

  return (
    <div className="space-y-8">
      <section className="grid gap-6 md:grid-cols-2">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
          {raffle.cover_image_url ? (
            <Image
              src={raffle.cover_image_url}
              alt={raffle.title}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-6xl">
              🛠️
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{raffle.title}</h1>
            <Badge variant="secondary">
              {statusLabel[raffle.status as Raffle["status"]]}
            </Badge>
          </div>
          {raffle.description && (
            <p className="text-muted-foreground">{raffle.description}</p>
          )}
          <p className="text-sm text-muted-foreground">
            Fecha del sorteo: {formatDateTime(raffle.draw_date)}
          </p>
          <p className="text-lg font-semibold">
            {formatPrice(Number(raffle.price_per_number))}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              por número
            </span>
          </p>

          {raffle.status === "drawn" && raffle.winner_number != null && (
            <div className="rounded-lg border bg-secondary/50 p-4">
              <p className="font-semibold">🎉 Sorteo finalizado</p>
              <p>
                Ganador: {raffle.winner_name ?? "Anónimo"} — Nº{" "}
                {raffle.winner_number}
              </p>
            </div>
          )}

          {organizer && <OrganizerCard organizer={organizer as Profile} />}
        </div>
      </section>

      {raffle.status === "active" && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Elegí tus números</h2>
            {isDev && (
              <span className="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-medium text-yellow-700 dark:text-yellow-300">
                Modo simulación de pagos activo
              </span>
            )}
          </div>
          <NumbersGrid
            raffleId={raffle.id}
            pricePerNumber={Number(raffle.price_per_number)}
            raffleStatus={raffle.status}
            isDev={isDev}
          />
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Premios</h2>
        {prizes && prizes.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {prizes.map((prize: Prize) => (
              <PrizeCard key={prize.id} prize={prize} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">
            Los premios se publicarán pronto.
          </p>
        )}
      </section>
    </div>
  );
}
