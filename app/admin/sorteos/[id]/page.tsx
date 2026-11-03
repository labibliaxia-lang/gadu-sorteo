import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  BarChart3,
  Grid3x3,
  LayoutTemplate,
  MessageCircle,
  Pencil,
} from "lucide-react";

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
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {soldCount ?? 0}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">Reservados</p>
              <p className="text-lg font-bold text-amber-800 dark:text-amber-300">
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
            <RaffleActions
              raffleId={raffle.id}
              status={raffle.status}
              hasCommitment={Boolean(raffle.draw_commitment)}
              soldCount={soldCount ?? 0}
            />
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
              href={`/admin/sorteos/${raffle.id}/preguntas`}
              className={buttonVariants({ variant: "outline" })}
            >
              <MessageCircle className="mr-1.5 h-4 w-4" />
              Preguntas
            </Link>
            <Link
              href={`/admin/sorteos/${raffle.id}/landing`}
              className={buttonVariants({ variant: "outline" })}
            >
              <LayoutTemplate className="mr-1.5 h-4 w-4" />
              Landing
            </Link>
            <Link
              href={`/admin/sorteos/${raffle.id}/analitica`}
              className={buttonVariants({ variant: "outline" })}
            >
              <BarChart3 className="mr-1.5 h-4 w-4" />
              Ver analítica
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
          <CardTitle>Pasos para publicar y sortear</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {[
            {
              label: "1. Datos del sorteo",
              detail: "Título, precio, fecha y datos de pago.",
              done: true,
            },
            {
              label: "2. Números y premios",
              detail: "Generá los números y cargá los premios.",
              done: true,
            },
            {
              label: "3. Compromiso publicado",
              detail:
                "Publicá el hash de la semilla antes de sortear: sin esto no se puede ejecutar el sorteo.",
              done: Boolean(raffle.draw_commitment),
            },
            {
              label: "4. Sorteo",
              detail:
                (soldCount ?? 0) > 0
                  ? "Ya hay números vendidos: podés sortear."
                  : "Necesitás al menos un número vendido para sortear.",
              done: raffle.status === "drawn",
            },
          ].map((step) => (
            <div
              key={step.label}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="font-medium">{step.label}</p>
                <p className="text-xs text-muted-foreground">{step.detail}</p>
              </div>
              <Badge variant={step.done ? "success" : "warning"}>
                {step.done ? "Listo" : "Pendiente"}
              </Badge>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-2 text-xs">
            <Link
              href={`/admin/sorteos/${raffle.id}/numeros`}
              className="text-amber-700 underline-offset-4 hover:underline dark:text-amber-400"
            >
              Gestionar números
            </Link>
            <Link
              href={`/admin/sorteos/${raffle.id}/premios`}
              className="text-amber-700 underline-offset-4 hover:underline dark:text-amber-400"
            >
              Gestionar premios
            </Link>
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
