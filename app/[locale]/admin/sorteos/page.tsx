import Link from "next/link";
import { redirect } from "next/navigation";
import { Ticket } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, formatPrice } from "@/lib/utils";
import type { Raffle } from "@/lib/types";

export const dynamic = "force-dynamic";

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

export default async function AdminSorteosPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isSuper = profile?.role === "superadmin";

  let rafflesQuery = supabase
    .from("raffles")
    .select("*")
    .order("created_at", { ascending: false });

  // Organizadores: solo sus propios sorteos; superadmin: todos.
  if (!isSuper) rafflesQuery = rafflesQuery.eq("created_by", user.id);

  const { data: raffles } = await rafflesQuery;

  return (
    <div className="space-y-4">
      {raffles && raffles.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No hay sorteos todavía"
          description="Creá el primero desde «Nuevo sorteo» para empezar a vender números."
          action={
            <Button asChild variant="outline">
              <Link href="/admin/sorteos/nuevo">Crear el primero</Link>
            </Button>
          }
        />
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
              <CardContent className="flex flex-wrap items-center justify-between gap-3 font-mono text-[12px] text-fg-subtle">
                <span>
                  {formatPrice(Number(raffle.price_per_number))} por número ·{" "}
                  {formatDateTime(raffle.draw_date)}
                </span>
                <div className="flex flex-wrap gap-2">
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
