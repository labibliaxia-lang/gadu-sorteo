import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RaffleActions } from "@/components/RaffleActions";
import { formatDateTime, formatPrice } from "@/lib/utils";
import type { Raffle } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusLabel: Record<Raffle["status"], string> = {
  active: "Activo",
  closed: "Cerrado",
  drawn: "Sorteado",
};

export default async function AdminRaffleDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: raffle } = await supabase
    .from("raffles")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!raffle) notFound();

  const { count: soldCount } = await supabase
    .from("raffle_numbers")
    .select("*", { count: "exact", head: true })
    .eq("raffle_id", params.id)
    .eq("status", "sold");

  const { count: reservedCount } = await supabase
    .from("raffle_numbers")
    .select("*", { count: "exact", head: true })
    .eq("raffle_id", params.id)
    .eq("status", "reserved");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>{raffle.title}</CardTitle>
          <Badge variant="secondary">
            {statusLabel[raffle.status as Raffle["status"]]}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">{raffle.description}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground">Precio por número</p>
              <p className="font-semibold">
                {formatPrice(Number(raffle.price_per_number))}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Fecha del sorteo</p>
              <p className="font-semibold">{formatDateTime(raffle.draw_date)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Vendidos / Reservados</p>
              <p className="font-semibold">
                {soldCount ?? 0} / {reservedCount ?? 0}
              </p>
            </div>
          </div>

          {raffle.status === "drawn" && (
            <div className="rounded-lg border bg-secondary/50 p-3">
              🎉 Ganador: {raffle.winner_name ?? "Anónimo"} — Nº{" "}
              {raffle.winner_number}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <RaffleActions raffleId={raffle.id} status={raffle.status} />
            <Button asChild variant="outline">
              <Link href={`/admin/sorteos/${raffle.id}/premios`}>
                Gestionar premios
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
