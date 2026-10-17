import Image from "next/image";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime, formatPrice } from "@/lib/utils";
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
  const { data: raffles, error } = await supabase
    .from("raffles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p className="text-destructive">
        Error al cargar los sorteos: {error.message}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold">Sorteos de herramientas</h1>
        <p className="text-muted-foreground">
          Elegí tus números, pagá con Mercado Pago y participá.
        </p>
      </section>

      {raffles && raffles.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          Todavía no hay sorteos publicados.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {raffles?.map((raffle: Raffle) => (
            <Card key={raffle.id} className="overflow-hidden">
              <div className="relative aspect-video w-full bg-muted">
                {raffle.cover_image_url ? (
                  <Image
                    src={raffle.cover_image_url}
                    alt={raffle.title}
                    fill
                    sizes="(max-width: 640px) 100vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-4xl">
                    🛠️
                  </div>
                )}
              </div>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-xl">{raffle.title}</CardTitle>
                  <Badge variant={statusVariant[raffle.status]}>
                    {statusLabel[raffle.status]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                {raffle.description && <p>{raffle.description}</p>}
                <p>Fecha del sorteo: {formatDateTime(raffle.draw_date)}</p>
                <p className="font-medium text-foreground">
                  {formatPrice(Number(raffle.price_per_number))} por número
                </p>
                {raffle.status === "drawn" && raffle.winner_number != null && (
                  <p className="font-medium text-foreground">
                    🎉 Ganador: {raffle.winner_name ?? "Anónimo"} — Nº{" "}
                    {raffle.winner_number}
                  </p>
                )}
              </CardContent>
              <CardFooter>
                <Button asChild className="w-full">
                  <Link href={`/sorteos/${raffle.id}`}>
                    {raffle.status === "active" ? "Participar" : "Ver sorteo"}
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
