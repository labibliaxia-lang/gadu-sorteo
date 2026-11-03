import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Trophy } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, formatNumber } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Muro de Ganadores | Gadu Sorteos",
  description:
    "Todos los sorteos finalizados de Gadu Sorteos con su número y su ganador.",
};

export const dynamic = "force-dynamic";

interface DrawnRaffle {
  id: string;
  title: string;
  cover_image_url: string | null;
  winner_number: number | null;
  winner_name: string | null;
  drawn_at: string | null;
  numbers_hash: string | null;
}

/**
 * Solo el primer nombre y la inicial del apellido: el muro es público, así que
 * el apellido completo nunca sale del servidor.
 */
function shortWinnerName(fullName: string | null): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Ganador anónimo";

  const first = parts[0];
  if (parts.length === 1) return first;

  const initial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${initial}.`;
}

export default async function GanadoresPage() {
  const supabase = createClient();

  const { data: raffles } = await supabase
    .from("raffles")
    .select(
      "id, title, cover_image_url, winner_number, winner_name, drawn_at, numbers_hash",
    )
    .eq("status", "drawn")
    .order("drawn_at", { ascending: false })
    .limit(60);

  const list = (raffles ?? []) as DrawnRaffle[];

  // Foto del premio: se usa la del primer premio cargado y, si no hay, la
  // portada del sorteo.
  const prizeImageByRaffle = new Map<string, string>();
  if (list.length > 0) {
    const { data: prizes } = await supabase
      .from("prizes")
      .select("raffle_id, image_url, position")
      .in(
        "raffle_id",
        list.map((raffle) => raffle.id),
      )
      .order("position", { ascending: true });

    for (const prize of prizes ?? []) {
      if (prize.image_url && !prizeImageByRaffle.has(prize.raffle_id)) {
        prizeImageByRaffle.set(prize.raffle_id, prize.image_url);
      }
    }
  }

  return (
    <div className="space-y-10">
      <header className="space-y-3 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-700 dark:text-brand-300">
          <Trophy className="h-4 w-4" />
          Hall of Fame
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Muro de Ganadores
        </h1>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Todos los sorteos que ya se jugaron, con su número ganador. Solo
          mostramos el primer nombre y la inicial del apellido.
        </p>
      </header>

      {list.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Todavía no hay ganadores"
          description="Cuando se sortee el primer sorteo, el ganador va a aparecer acá."
          action={
            <Link href="/#sorteos" className={buttonVariants()}>
              Ver sorteos activos
            </Link>
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((raffle) => {
            const image =
              prizeImageByRaffle.get(raffle.id) ?? raffle.cover_image_url;

            return (
              <Card key={raffle.id} className="overflow-hidden">
                <div className="relative aspect-video w-full bg-muted">
                  {image ? (
                    <Image
                      src={image}
                      alt={raffle.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl">
                      🎁
                    </div>
                  )}
                  <span className="absolute left-3 top-3">
                    <Badge className="border-transparent bg-emerald-700 text-white">
                      Sorteado
                    </Badge>
                  </span>
                  {raffle.numbers_hash && (
                    <span className="absolute right-3 top-3">
                      <Badge className="border-transparent bg-ink/80 text-white">
                        <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                        Verificado
                      </Badge>
                    </span>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-ink/80 to-transparent" />
                </div>

                <CardHeader className="space-y-1 pb-2">
                  <CardTitle className="text-lg leading-tight">
                    {raffle.title}
                  </CardTitle>
                  {raffle.drawn_at && (
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(raffle.drawn_at)}
                    </p>
                  )}
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-500/30 bg-brand-500/5 p-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Ganador
                      </p>
                      <p className="font-semibold">
                        {shortWinnerName(raffle.winner_name)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Número
                      </p>
                      <p className="font-mono text-2xl font-bold text-brand-700 dark:text-brand-300">
                        {raffle.winner_number != null
                          ? formatNumber(raffle.winner_number)
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      href={`/sorteos/${raffle.id}`}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "flex-1",
                      })}
                    >
                      Ver el sorteo
                    </Link>
                    <Link
                      href={`/sorteos/${raffle.id}/verificar`}
                      className={buttonVariants({
                        size: "sm",
                        className: "flex-1",
                      })}
                    >
                      Verificar
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Cada resultado puede verificarse en la página del sorteo con la semilla
        comprometida y las huellas publicadas.
      </p>
    </div>
  );
}
