import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  BarChart3,
  Grid3x3,
  LayoutTemplate,
  MessageCircle,
  Pencil,
  Receipt,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/auth";
import { getPlanContext } from "@/lib/plans";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { AutoDrawToggle } from "@/components/AutoDrawToggle";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RaffleActions } from "@/components/RaffleActions";
import { CopyLandingLink } from "@/components/CopyLandingLink";
import { PublishCommitmentButton } from "@/components/PublishCommitmentButton";
import { RaffleDeleteButton } from "@/components/RaffleDeleteButton";
import { RefundMarkPaidButton } from "@/components/admin/RefundMarkPaidButton";
import { RaffleCloneButton } from "@/components/RaffleCloneButton";
import { ReservedNumbersPanel } from "@/components/ReservedNumbersPanel";
import { formatDateTime, formatPrice } from "@/lib/utils";
import type { Raffle } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusLabel: Record<Raffle["status"], string> = {
  active: "Activo",
  closed: "Cerrado",
  drawn: "Sorteado",
  cancelled: "Cancelado",
};

export default async function AdminRaffleDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { creado?: string };
}) {
  const supabase = createClient();

  // P0: un organizador no puede espiar el detalle de un sorteo ajeno. RLS de
  // `raffles` es pÃºblica por diseÃ±o (la pÃ¡gina pÃºblica lo necesita), asÃ­ que la
  // pertenencia se valida acÃ¡, en el servidor.
  const actor = await requireAdminSession();
  if (!actor) redirect("/login");

  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("plan, role")
    .eq("id", actor.id)
    .maybeSingle();

  const planContext = getPlanContext(actorProfile);
  const canAutoDraw = planContext.isPremium || planContext.isSuperadmin;

  const { data: raffle } = await supabase
    .from("raffles")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!raffle) notFound();
  if (!actor.isSuper && raffle.created_by !== actor.id) notFound();

  // DirecciÃ³n de entrega de los ganadores: sÃ³lo el organizador dueÃ±o (o
  // superadmin) la ve, y sÃ³lo para los ganadores de este sorteo.
  let winnerContacts: {
    position: number;
    number: number;
    user_name: string | null;
    user_id: string | null;
    address_line: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    country: string | null;
  }[] = [];

  if (raffle.status === "drawn") {
    const { data: winnerRows } = await supabase
      .from("raffle_winners")
      .select("position, number, user_name, user_id")
      .eq("raffle_id", params.id)
      .order("position", { ascending: true });

    const winners = winnerRows ?? [];
    const winnerIds = winners
      .map((winner) => winner.user_id as string | null)
      .filter((value): value is string => Boolean(value));

    if (winnerIds.length > 0) {
      const admin = createAdminClient();
      const { data: profiles } = await admin
        .from("profiles")
        .select(
          "id, address_line, city, province, postal_code, country",
        )
        .in("id", winnerIds);

      const byId = new Map(
        (profiles ?? []).map((profile) => [profile.id as string, profile]),
      );

      winnerContacts = winners.map((winner) => {
        const profile = winner.user_id
          ? byId.get(winner.user_id as string)
          : undefined;
        return {
          position: winner.position as number,
          number: winner.number as number,
          user_name: winner.user_name as string | null,
          user_id: winner.user_id as string | null,
          address_line: (profile?.address_line as string | null) ?? null,
          city: (profile?.city as string | null) ?? null,
          province: (profile?.province as string | null) ?? null,
          postal_code: (profile?.postal_code as string | null) ?? null,
          country: (profile?.country as string | null) ?? null,
        };
      });
    }
  }

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

  // Eliminar solo tiene sentido mientras el sorteo no existiÃ³ para nadie:
  // sin nÃºmeros movidos, sin pagos y sin compromiso. La base lo hace cumplir
  // igual (0087); acÃ¡ se oculta el botÃ³n para no ofrecer algo que va a fallar.
  const { count: paymentsCount } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("raffle_id", params.id);

  const canDeleteRaffle =
    (soldCount ?? 0) === 0 &&
    (reservedCount ?? 0) === 0 &&
    (paymentsCount ?? 0) === 0 &&
    !raffle.draw_commitment;

  // Reservas vivas para el prepago manual (WhatsApp). Se agrupan por comprador
  // porque un mismo comprobante cubre todos los nÃºmeros de esa persona.
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

  // Contacto del comprador para validar la transferencia. Sale de la vista
  // `raffle_buyers` (0073): nombre y telÃ©fono y nada mÃ¡s. La polÃ­tica anterior
  // le daba al organizador la fila entera del perfil (email, DNI, domicilio).
  const buyersResult = reservedBuyerIds.length
    ? await supabase
        .from("raffle_buyers")
        .select("buyer_id, full_name, phone")
        .eq("raffle_id", params.id)
        .eq("kind", "reserved")
    : {
        data: [] as {
          buyer_id: string;
          full_name: string | null;
          phone: string | null;
        }[],
      };

  const buyers = (
    (buyersResult.data ?? []) as {
      buyer_id: string;
      full_name: string | null;
      phone: string | null;
    }[]
  ).map((row) => ({
    id: row.buyer_id,
    full_name: row.full_name,
    phone: row.phone,
  }));
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

  let refunds: {
    id: string;
    user_id: string;
    user_name: string;
    amount: number;
    status: string;
    paid_at: string | null;
  }[] = [];

  if (raffle.status === "cancelled") {
    const { data: refundRows } = await supabase
      .from("refunds")
      .select("id, user_id, amount, status, paid_at")
      .eq("raffle_id", params.id)
      .order("created_at", { ascending: true });

    const refundUserIds = Array.from(
      new Set((refundRows ?? []).map((row) => row.user_id as string)),
    );
    let refundNames = new Map<string, string>();

    if (refundUserIds.length > 0) {
      const admin = createAdminClient();
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name")
        .in("id", refundUserIds);
      refundNames = new Map(
        (profiles ?? []).map((profile) => [
          profile.id as string,
          (profile.full_name as string | null)?.trim() || "Comprador",
        ]),
      );
    }

    refunds = (refundRows ?? []).map((row) => ({
      id: row.id as string,
      user_id: row.user_id as string,
      user_name: refundNames.get(row.user_id as string) ?? "Comprador",
      amount: Number(row.amount),
      status: row.status as string,
      paid_at: (row.paid_at as string | null) ?? null,
    }));
  }

  return (
    <div className="space-y-6">
      {searchParams?.creado === "1" && (
        <div className="space-y-3 rounded-xl border border-emerald-600/30 bg-emerald-500/5 p-4">
          <div>
            <p className="font-semibold">
              Sorteo creado. Tu landing ya estÃ¡ publicada.
            </p>
            <p className="text-sm text-muted-foreground">
              Compartila ahora mismo: no hay que publicar nada mÃ¡s. El contenido
              promocional lo podÃ©s editar despuÃ©s.
            </p>
          </div>
          <CopyLandingLink raffleId={raffle.id} />
        </div>
      )}

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
              <p className="text-sm text-muted-foreground">Precio por nÃºmero</p>
              <p className="text-lg font-bold">
                {formatPrice(Number(raffle.price_per_number))}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">NÃºmeros vendidos</p>
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
            <p className="text-sm text-muted-foreground">NÃºmero ganador</p>
            {raffle.status === "drawn" && raffle.winner_number != null ? (
              <p className="text-lg font-bold">
                ðŸŽ‰ {raffle.winner_name ?? "AnÃ³nimo"} â€” NÂº {raffle.winner_number}
              </p>
            ) : (
              <p className="text-muted-foreground">
                AÃºn no se realizÃ³ el sorteo.
              </p>
            )}
          </div>

          {winnerContacts.length > 0 && (
            <div className="space-y-2 rounded-xl border border-emerald-600/30 bg-emerald-500/5 p-4">
              <p className="text-sm font-semibold">
                Direcciones de entrega de los ganadores
              </p>
              <p className="text-xs text-muted-foreground">
                Privado: sÃ³lo lo ves vos como organizador de este sorteo. No se
                muestra en la pÃ¡gina pÃºblica.
              </p>
              <div className="space-y-2">
                {winnerContacts.map((winner) => (
                  <div
                    key={winner.position}
                    className="rounded-lg border bg-background/70 p-3 text-sm"
                  >
                    <p className="font-medium">
                      {winner.position === 1
                        ? "1.er premio"
                        : `${winner.position}Âº premio`}{" "}
                      Â· NÂº {winner.number} Â·{" "}
                      {winner.user_name ?? "Ganador anÃ³nimo"}
                    </p>
                    {winner.address_line ? (
                      <p className="mt-1 text-muted-foreground">
                        {winner.address_line}, {winner.city},{" "}
                        {winner.province}, CP {winner.postal_code},{" "}
                        {winner.country}
                      </p>
                    ) : (
                      <p className="mt-1 text-muted-foreground">
                        El ganador todavÃ­a no cargÃ³ una direcciÃ³n de entrega.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {raffle.status === "cancelled" && (
            <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
              <div>
                <p className="font-semibold">Sorteo cancelado</p>
                <p className="text-xs text-muted-foreground">
                  {raffle.cancellation_reason ||
                    "No se alcanzÃ³ el mÃ­nimo de venta o el organizador lo cancelÃ³."}
                </p>
              </div>

              {refunds.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay compradores con nÃºmeros vendidos para devolver.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Devoluciones manuales ({refunds.filter((r) => r.status === "paid").length}/
                    {refunds.length} pagadas):
                  </p>
                  {refunds.map((refund) => (
                    <div
                      key={refund.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background/70 p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">{refund.user_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatPrice(refund.amount)}
                          {refund.paid_at
                            ? ` Â· ${formatDateTime(refund.paid_at)}`
                            : ""}
                        </p>
                      </div>
                      <RefundMarkPaidButton
                        refundId={refund.id}
                        paid={refund.status === "paid"}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <RaffleActions
              raffleId={raffle.id}
              status={raffle.status}
              drawDate={raffle.draw_date}
              autoDraw={Boolean(raffle.auto_draw)}
              hasCommitment={Boolean(raffle.draw_commitment)}
              soldCount={soldCount ?? 0}
            />
            <Link
              href={`/admin/sorteos/${raffle.id}/numeros`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Grid3x3 className="mr-1.5 h-4 w-4" />
              Gestionar nÃºmeros
            </Link>
            <Link
              href={`/admin/sorteos/${raffle.id}/ventas`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Receipt className="mr-1.5 h-4 w-4" />
              Ventas
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
              Ver analÃ­tica
            </Link>
            <Link
              href={`/admin/sorteos/${raffle.id}/editar`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              Editar sorteo
            </Link>
            <RaffleCloneButton raffleId={raffle.id} />
            {canDeleteRaffle ? (
              <RaffleDeleteButton raffleId={raffle.id} />
            ) : (
              <span
                className="self-center text-xs text-fg-subtle"
                title="Tiene nÃºmeros movidos, pagos o compromiso publicado: se cancela en lugar de eliminarse."
              >
                No se puede eliminar: tiene actividad
              </span>
            )}
          </div>

          <AutoDrawToggle
            raffleId={raffle.id}
            enabled={Boolean(raffle.auto_draw)}
            canAutoDraw={canAutoDraw}
            drawDate={raffle.draw_date}
            hasCommitment={Boolean(raffle.draw_commitment)}
            soldCount={soldCount ?? 0}
            disabled={raffle.status === "drawn"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Landing pÃºblica</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            La pÃ¡gina del sorteo se genera al crearlo y queda publicada en esta
            direcciÃ³n. Copiala para difundirla en el momento que quieras.
          </p>
          <CopyLandingLink raffleId={raffle.id} />
          <Link
            href={`/admin/sorteos/${raffle.id}/landing`}
            className="inline-flex text-sm text-amber-700 underline-offset-4 hover:underline dark:text-amber-300"
          >
            Editar contenido de la landing
          </Link>
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
              detail: "TÃ­tulo, precio, fecha y datos de pago.",
              done: true,
              action: null,
            },
            {
              label: "2. NÃºmeros y premios",
              detail: "GenerÃ¡ los nÃºmeros y cargÃ¡ los premios.",
              done: true,
              action: null,
            },
            {
              label: "3. Compromiso publicado",
              detail:
                "PublicÃ¡ el hash de la semilla antes de sortear: sin esto no se puede ejecutar el sorteo.",
              done: Boolean(raffle.draw_commitment),
              // El botÃ³n vive acÃ¡ y no solo en la fila de acciones: el paso que
              // dice Â«PendienteÂ» tiene que traer la acciÃ³n al lado.
              action: raffle.draw_commitment ? null : (
                <PublishCommitmentButton raffleId={raffle.id} />
              ),
            },
            {
              label: "4. Sorteo",
              detail:
                (soldCount ?? 0) > 0
                  ? "Ya hay nÃºmeros vendidos: podÃ©s sortear."
                  : "NecesitÃ¡s al menos un nÃºmero vendido para sortear.",
              done: raffle.status === "drawn",
              action: null,
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
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={step.done ? "success" : "warning"}>
                  {step.done ? "Listo" : "Pendiente"}
                </Badge>
                {step.action}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-2 text-xs">
            <Link
              href={`/admin/sorteos/${raffle.id}/numeros`}
              className="text-amber-700 underline-offset-4 hover:underline dark:text-amber-400"
            >
              Gestionar nÃºmeros
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
            Prepago manual: el comprador reserva sus nÃºmeros, manda el
            comprobante por WhatsApp y desde acÃ¡ confirmÃ¡s el pago.
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
