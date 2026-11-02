import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Grid3x3, Pencil } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RaffleActions } from "@/components/RaffleActions";
import { RaffleDeleteButton } from "@/components/RaffleDeleteButton";
import { RaffleCloneButton } from "@/components/RaffleCloneButton";
import { ReservedNumbersPanel } from "@/components/ReservedNumbersPanel";
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

  // P0: un organizador no puede espiar el detalle de un sorteo ajeno. RLS de
  // `raffles` es pública por diseño (la página pública lo necesita), así que la
  // pertenencia se valida acá, en el servidor.
  const actor = await requireAdminSession();
  if (!actor) redirect("/login");

  const { data: raffle } = await supabase
    .from("raffles")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!raffle) notFound();
  if (!actor.isSuper && raffle.created_by !== actor.id) notFound();

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

  // Reservas vivas para el prepago manual (WhatsApp). Se agrupan por comprador
  // porque un mismo comprobante cubre todos los números de esa persona.
  const { data: reservedRows } = await supabase
    .from("raffle_numbers")
    .select("number, reserved_by, reserved_until")
    .eq("raffle_id", params.id)
    .eq("status", "reserved")
    .not("reserved_by", "is", null)
    .order("number", { ascending: true })
    .limit(1000);

  const reservedBuyerIds = Array.from(
    new Set(
      (reservedRows ?? [])
        .map((row) => row.reserved_by as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const buyersResult = reservedBuyerIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", reservedBuyerIds)
    : {
        data: [] as {
          id: string;
          full_name: string | null;
          phone: string | null;
        }[],
      };

  const buyers = (buyersResult.data ?? []) as {
    id: string;
    full_name: string | null;
    phone: string | null;
  }[];
  const buyerById = new Map(buyers.map((buyer) => [buyer.id, buyer]));

  const reservedGroups = reservedBuyerIds
    .map((userId) => {
      const rows = (reservedRows ?? []).filter(
        (row) => row.reserved_by === userId,
      );
      const buyer = buyerById.get(userId);

      return {
        userId,
        name: buyer?.full_name?.trim() || "Comprador sin nombre",
        phone: buyer?.phone ?? null,
        numbers: rows
          .map((row) => row.number as number)
          .sort((a: number, b: number) => a - b),
        expiresAt: rows.reduce<string | null>((min, row) => {
          const value = row.reserved_until as string | null;
          if (!value) return min;
          if (!min) return value;
          return value < min ? value : min;
        }, null),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

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
              href={`/admin/sorteos/${raffle.id}/numeros`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Grid3x3 className="mr-1.5 h-4 w-4" />
              Gestionar números
            </Link>
            <Link
              href={`/admin/sorteos/${raffle.id}/premios`}
              className={buttonVariants({ variant: "outline" })}
            >
              Gestionar premios
            </Link>
            <Link
              href={`/admin/sorteos/${raffle.id}/editar`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              Editar sorteo
            </Link>
            <RaffleCloneButton raffleId={raffle.id} />
            <RaffleDeleteButton raffleId={raffle.id} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reservas esperando pago</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Prepago manual: el comprador reserva sus números, manda el
            comprobante por WhatsApp y desde acá confirmás el pago.
          </p>
          <ReservedNumbersPanel
            raffleId={raffle.id}
            pricePerNumber={Number(raffle.price_per_number)}
            groups={reservedGroups}
          />
        </CardContent>
      </Card>
    </div>
  );
}
