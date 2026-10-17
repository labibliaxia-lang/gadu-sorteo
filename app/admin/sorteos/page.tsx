import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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

export default async function AdminSorteosPage() {
  const supabase = createClient();
  const { data: raffles } = await supabase
    .from("raffles")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      {raffles && raffles.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          No hay sorteos todavía. Creá el primero.
        </p>
      ) : (
        <div className="grid gap-4">
          {raffles?.map((raffle: Raffle) => (
            <Card key={raffle.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-lg">{raffle.title}</CardTitle>
                <Badge variant={statusVariant[raffle.status]}>
                  {statusLabel[raffle.status]}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                  {formatPrice(Number(raffle.price_per_number))} por número ·{" "}
                  {formatDateTime(raffle.draw_date)}
                </span>
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/sorteos/${raffle.id}`}>
                      Gestionar
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/sorteos/${raffle.id}/premios`}>
                      Premios
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/sorteos/${raffle.id}`}>Ver público</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
