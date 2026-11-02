import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Trophy } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      "id, title, cover_image_url, winner_number, winner_name, drawn_at",
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
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
          <Trophy className="h-4 w-4" />
          Hall of Fame
        </span>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Muro de Ganadores
        </h1>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Todos los sorteos que ya se jugaron, con su número ganador. Solo
          mostramos el primer nombre y la inicial del apellido.
        </p>
      </header>

      {list.length === 0 ? (
        <Card className="mx-auto max-w-md border-dashed text-center">
          <CardContent className="space-y-2 py-12">
            <Trophy className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Todavía no hay ganadores</h2>
            <p className="text-sm text-muted-foreground">
              Cuando se sortee el primer sorteo, el ganador va a aparecer acá.
            </p>
            <Link href="/#sorteos" className={buttonVariants()}>
              Ver sorteos activos
            </Link>
          </CardContent>
        </Card>
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
                    <Badge className="border-transparent bg-emerald-600 text-white">
                      Sorteado
                    </Badge>
                  </span>
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
                  <div className="flex items-center justify-between gap-3 rounded-xl border bg-secondary/40 p-3">
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
                      <p className="font-mono text-xl font-bold text-amber-600 dark:text-amber-400">
                        {raffle.winner_number != null
                          ? formatNumber(raffle.winner_number)
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <Link
                    href={`/sorteos/${raffle.id}`}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "w-full",
                    })}
                  >
                    Ver el sorteo
                  </Link>
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
