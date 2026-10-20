import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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

        <CardContent className="space-y-4 text-sm">
          {raffle.description && (
            <p className="text-muted-foreground">{raffle.description}</p>
          )}

          {/* Resumen ejecutivo */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">Precio por número</p>
              <p className="text-lg font-bold">
                {formatPrice(Number(raffle.price_per_number))}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">Números vendidos</p>
              <p className="text-lg font-bold text-emerald-600">
                {soldCount ?? 0}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">Reservados</p>
              <p className="text-lg font-bold text-amber-600">
                {reservedCount ?? 0}
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">Fecha del sorteo</p>
            <p className="font-semibold">{formatDateTime(raffle.draw_date)}</p>
          </div>

          {/* Ganador */}
          <div className="rounded-xl border bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">Número ganador</p>
            {raffle.status === "drawn" && raffle.winner_number != null ? (
              <p className="text-lg font-bold">
                🎉 {raffle.winner_name ?? "Anónimo"} — Nº {raffle.winner_number}
              </p>
            ) : (
              <p className="text-muted-foreground">
                Aún no se realizó el sorteo.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <RaffleActions raffleId={raffle.id} status={raffle.status} />
            <Link
              href={`/admin/sorteos/${raffle.id}/premios`}
              className={buttonVariants({ variant: "outline" })}
            >
              Gestionar premios
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
