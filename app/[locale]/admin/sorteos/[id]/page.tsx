import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  BarChart3,
  Grid3x3,
  LayoutTemplate,
  MessageCircle,
  Pencil,
  Receipt,
} from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/auth";
import { getPlanContext } from "@/lib/plans";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { AutoDrawToggle } from "@/components/AutoDrawToggle";
import { InvitarResenas } from "@/components/InvitarResenas";
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
import { RefundRow } from "@/components/admin/RefundRow";
import { CopyTextButton } from "@/components/CopyTextButton";
import { DownloadWinnerCard } from "@/components/DownloadWinnerCard";
import { NotifyWinnerButton } from "@/components/admin/NotifyWinnerButton";
import { RaffleCloneButton } from "@/components/RaffleCloneButton";
import { ReservedNumbersPanel } from "@/components/ReservedNumbersPanel";
import { formatDateTime, formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminRaffleDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { creado?: string };
}) {
  const t = await getTranslations("AdminSorteosDetail");
  const tc = await getTranslations("Common");
  const locale = await getLocale();
  const supabase = createClient();

  // P0: un organizador no puede espiar el detalle de un sorteo ajeno. RLS de
  // `raffles` es pública por diseño (la página pública lo necesita), así que la
  // pertenencia se valida acá, en el servidor.
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

  // 0115: slug para enlaces públicos y de referidos (con fallback al UUID).
  const publicSlug = (raffle.slug as string | null) ?? raffle.id;
  const siteBase = (process.env.NEXT_PUBLIC_URL ?? "").replace(/\/$/, "");
  const referralUrl = `${siteBase}/sorteos/${publicSlug}?ref=${actor.id}`;

  // Dirección de entrega de los ganadores: sólo el organizador dueño (o
  // superadmin) la ve, y sólo para los ganadores de este sorteo.
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

  // 0105: si este sorteo es el destino de premios de referidos de otros,
  // el organizador lo ve acá para no confundir esos números con ventas.
  const { data: sorteosOrigen } = await supabase
    .from("raffles")
    .select("id, title")
    .eq("bonus_raffle_id", params.id);

  const { count: soldCount } = await supabase
    .from("raffle_numbers")
    .select("*", { count: "exact", head: true })
    .eq("raffle_id", params.id)
    .eq("status", "sold");

  // Vendidos sin pago vinculado: si el sorteo se sortea así, el comprador
  // (posible ganador) queda sin comprobante. Desde 0099 se puede registrar
  // incluso con el sorteo sorteado, pero mejor avisar antes.
  const { count: soldSinPago } = await supabase
    .from("raffle_numbers")
    .select("*", { count: "exact", head: true })
    .eq("raffle_id", params.id)
    .eq("status", "sold")
    .is("payment_id", null);

  const { count: reservedCount } = await supabase
    .from("raffle_numbers")
    .select("*", { count: "exact", head: true })
    .eq("raffle_id", params.id)
    .eq("status", "reserved");

  // Eliminar solo tiene sentido mientras el sorteo no existió para nadie:
  // sin números movidos, sin pagos y sin compromiso. La base lo hace cumplir
  // igual (0087); acá se oculta el botón para no ofrecer algo que va a fallar.
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

  // Contacto del comprador para validar la transferencia. Sale de la vista
  // `raffle_buyers` (0073): nombre y teléfono y nada más. La política anterior
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

  // Compradores con números vendidos, para invitarlos a dejar reseña.
  // Sólo tiene sentido con el sorteo ya sorteado: la política de `reviews`
  // (0045) exige número comprado Y sorteo en estado `drawn`, así que antes de
  // sortear la invitación llevaría a un callejón sin salida.
  let compradoresParaResena: { nombre: string; telefono: string | null; numeros: number }[] = [];
  if (raffle.status === "drawn") {
    // Paginado: PostgREST corta en 1000 filas y el conteo quedaría mal.
    const vendidos: { sold_to: string | null }[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await supabase
        .from("raffle_numbers")
        .select("sold_to")
        .eq("raffle_id", params.id)
        .eq("status", "sold")
        .range(desde, desde + 999);
      if (error || !data || data.length === 0) break;
      vendidos.push(...(data as { sold_to: string | null }[]));
      if (data.length < 1000) break;
    }

    const { data: contactosVenta } = await supabase
      .from("raffle_buyers")
      .select("buyer_id, full_name, phone")
      .eq("raffle_id", params.id)
      .eq("kind", "sold");

    const contactos = new Map(
      ((contactosVenta ?? []) as { buyer_id: string; full_name: string | null; phone: string | null }[]).map(
        (c) => [c.buyer_id, c],
      ),
    );

    const conteo = new Map<string, number>();
    for (const fila of vendidos) {
      if (!fila.sold_to) continue;
      conteo.set(fila.sold_to, (conteo.get(fila.sold_to) ?? 0) + 1);
    }

    compradoresParaResena = [...conteo.entries()]
      .map(([id, numeros]) => ({
        nombre: contactos.get(id)?.full_name?.trim() || t("buyerNoName"),
        telefono: contactos.get(id)?.phone ?? null,
        numeros,
      }))
      .sort((a, b) => b.numeros - a.numeros);
  }

  const reservedGroups = reservedBuyerIds
    .map((userId) => {
      const rows = (reservedRows ?? []).filter(
        (row) => row.reserved_by === userId,
      );
      const buyer = buyerById.get(userId);

      return {
        userId,
        name: buyer?.full_name?.trim() || t("buyerNoName"),
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
    confirmed: boolean;
    token: string;
  }[] = [];

  {
    const { data: refundRows } = await supabase
      .from("refunds")
      .select("id, user_id, amount, status, paid_at, buyer_confirmed_at, confirmation_token")
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
          (profile.full_name as string | null)?.trim() || t("buyer"),
        ]),
      );
    }

    refunds = (refundRows ?? []).map((row) => ({
      id: row.id as string,
      user_id: row.user_id as string,
      user_name: refundNames.get(row.user_id as string) ?? t("buyer"),
      amount: Number(row.amount),
      status: row.status as string,
      paid_at: (row.paid_at as string | null) ?? null,
      confirmed: Boolean(row.buyer_confirmed_at),
      token: row.confirmation_token as string,
    }));
  }

  return (
    <div className="space-y-6">
      {searchParams?.creado === "1" && (
        <div className="space-y-3 rounded-xl border border-emerald-600/30 bg-emerald-500/5 p-4">
          <div>
            <p className="font-semibold">
              {t("created.title")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("created.description")}
            </p>
          </div>
          <CopyLandingLink raffleId={publicSlug} />
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>{raffle.title}</CardTitle>
          <Badge variant="secondary">
            {tc(`status.${raffle.status}`)}
          </Badge>
        </CardHeader>

        <CardContent className="space-y-4 text-sm">
          {raffle.description && (
            <p className="text-muted-foreground">{raffle.description}</p>
          )}

          {/* Resumen ejecutivo */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">{t("summary.pricePerNumber")}</p>
              <p className="text-lg font-bold">
                {formatPrice(Number(raffle.price_per_number), locale)}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">{t("summary.sold")}</p>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {soldCount ?? 0}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">{t("summary.reserved")}</p>
              <p className="text-lg font-bold text-amber-800 dark:text-amber-300">
                {reservedCount ?? 0}
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">{t("drawDate")}</p>
            <p className="font-semibold">{formatDateTime(raffle.draw_date, locale)}</p>
          </div>

          {/* Ganador */}
          <div className="rounded-xl border bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">{t("winner.title")}</p>
            {raffle.status === "drawn" && raffle.winner_number != null ? (
              <>
                <p className="text-lg font-bold">
                  {t("winner.line", {
                    name: raffle.winner_name ?? tc("anonymous"),
                    number: raffle.winner_number,
                  })}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <NotifyWinnerButton raffleId={raffle.id} />
                  <DownloadWinnerCard
                    title={raffle.title}
                    winnerName={raffle.winner_name ?? null}
                    winnerNumber={Number(raffle.winner_number)}
                  />
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">
                {t("winner.none")}
              </p>
            )}
          </div>

          {winnerContacts.length > 0 && (
            <div className="space-y-2 rounded-xl border border-emerald-600/30 bg-emerald-500/5 p-4">
              <p className="text-sm font-semibold">
                {t("delivery.title")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("delivery.description")}
              </p>
              <div className="space-y-2">
                {winnerContacts.map((winner) => (
                  <div
                    key={winner.position}
                    className="rounded-lg border bg-background/70 p-3 text-sm"
                  >
                    <p className="font-medium">
                      {t("delivery.line", {
                        position:
                          winner.position === 1
                            ? t("delivery.positionFirst")
                            : t("delivery.positionOther", {
                                position: winner.position,
                              }),
                        number: winner.number,
                        name: winner.user_name ?? tc("anonymousWinner"),
                      })}
                    </p>
                    {winner.address_line ? (
                      <p className="mt-1 text-muted-foreground">
                        {winner.address_line}, {winner.city},{" "}
                        {winner.province}, {t("delivery.postalCode")}{" "}
                        {winner.postal_code}, {winner.country}
                      </p>
                    ) : (
                      <p className="mt-1 text-muted-foreground">
                        {t("delivery.noAddress")}
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
                <p className="font-semibold">{t("cancelled.title")}</p>
                <p className="text-xs text-muted-foreground">
                  {raffle.cancellation_reason ||
                    t("cancelled.defaultReason")}
                </p>
              </div>

              {refunds.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("cancelled.noBuyers")}
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {t("cancelled.refunds", {
                      paid: refunds.filter((r) => r.status === "paid").length,
                      total: refunds.length,
                    })}
                  </p>
                  {refunds.map((refund) => (
                    <RefundRow
                      key={refund.id}
                      refundId={refund.id}
                      nombre={refund.user_name}
                      amount={refund.amount}
                      status={refund.status}
                      confirmed={refund.confirmed}
                      token={refund.token}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {raffle.status !== "cancelled" && refunds.length > 0 && (
            <div className="space-y-3 rounded-xl border p-4">
              <div>
                <p className="font-semibold">{t("refunds.title")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("refunds.description")}
                </p>
              </div>
              <div className="space-y-2">
                {refunds.map((refund) => (
                  <RefundRow
                    key={refund.id}
                    refundId={refund.id}
                    nombre={refund.user_name}
                    amount={refund.amount}
                    status={refund.status}
                    confirmed={refund.confirmed}
                    token={refund.token}
                  />
                ))}
              </div>
            </div>
          )}

          {raffle.status === "paused" && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
              <p className="font-semibold">{t("paused.title")}</p>
              <p className="mt-1 text-[13px]">
                {t("paused.text")}
              </p>
            </div>
          )}

          {(sorteosOrigen ?? []).length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
              <p className="font-semibold">{t("bonus.title")}</p>
              <p className="mt-1 text-[13px]">
                {t("bonus.text", {
                  titles: (sorteosOrigen ?? [])
                    .map((s) => s.title as string)
                    .join(", "),
                })}
              </p>
            </div>
          )}

          {(soldSinPago ?? 0) > 0 && raffle.status !== "cancelled" && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
              <p className="font-semibold">
                {t("soldNoPayment.title", { count: soldSinPago ?? 0 })}
              </p>
              <p className="mt-1 text-[13px]">
                {t.rich("soldNoPayment.text", {
                  link: (chunks) => (
                    <LocaleLink
                      href={`/admin/sorteos/${raffle.id}/ventas`}
                      className="underline underline-offset-2"
                    >
                      {chunks}
                    </LocaleLink>
                  ),
                })}
              </p>
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
            <LocaleLink
              href={`/admin/sorteos/${raffle.id}/numeros`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Grid3x3 className="mr-1.5 h-4 w-4" />
              {t("actions.manageNumbers")}
            </LocaleLink>
            <LocaleLink
              href={`/admin/sorteos/${raffle.id}/ventas`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Receipt className="mr-1.5 h-4 w-4" />
              {t("actions.sales")}
            </LocaleLink>
            {raffle.status === "drawn" && (
              <div className="w-full">
                <InvitarResenas
                  sorteoId={raffle.id}
                  tituloSorteo={raffle.title}
                  compradores={compradoresParaResena}
                />
              </div>
            )}
            <LocaleLink
              href={`/admin/sorteos/${raffle.id}/premios`}
              className={buttonVariants({ variant: "outline" })}
            >
              {t("actions.prizes")}
            </LocaleLink>
            <LocaleLink
              href={`/admin/sorteos/${raffle.id}/preguntas`}
              className={buttonVariants({ variant: "outline" })}
            >
              <MessageCircle className="mr-1.5 h-4 w-4" />
              {t("actions.questions")}
            </LocaleLink>
            <LocaleLink
              href={`/admin/sorteos/${raffle.id}/landing`}
              className={buttonVariants({ variant: "outline" })}
            >
              <LayoutTemplate className="mr-1.5 h-4 w-4" />
              {t("actions.landing")}
            </LocaleLink>
            <LocaleLink
              href={`/admin/sorteos/${raffle.id}/analitica`}
              className={buttonVariants({ variant: "outline" })}
            >
              <BarChart3 className="mr-1.5 h-4 w-4" />
              {t("actions.analytics")}
            </LocaleLink>
            <LocaleLink
              href={`/admin/sorteos/${raffle.id}/editar`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              {t("actions.edit")}
            </LocaleLink>
            <RaffleCloneButton raffleId={raffle.id} />
            {canDeleteRaffle ? (
              <RaffleDeleteButton raffleId={raffle.id} />
            ) : (
              <span
                className="self-center text-xs text-fg-subtle"
                title={t("actions.cannotDeleteTitle")}
              >
                {t("actions.cannotDelete")}
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
          <CardTitle>{t("landing.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {t("landing.description")}
          </p>
          <CopyLandingLink raffleId={publicSlug} />
          <LocaleLink
            href={`/admin/sorteos/${raffle.id}/landing`}
            className="inline-flex text-sm text-amber-700 underline-offset-4 hover:underline dark:text-amber-300"
          >
            {t("landing.edit")}
          </LocaleLink>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("referral.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {raffle.referral_enabled ? (
            <>
              <p className="text-muted-foreground">
                {t("referral.enabledText")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">
                  {referralUrl || `/sorteos/${publicSlug}?ref=${actor.id}`}
                </code>
                <CopyTextButton
                  texto={referralUrl || `/sorteos/${publicSlug}?ref=${actor.id}`}
                  label={t("referral.copy")}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">
                {t.rich("referral.disabledText", {
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
              <LocaleLink
                href={`/admin/sorteos/${raffle.id}/editar`}
                className="inline-flex text-sm text-amber-700 underline-offset-4 hover:underline dark:text-amber-300"
              >
                {t("referral.enable")}
              </LocaleLink>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("steps.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!raffle.draw_commitment && (
            <div className="mb-2 animate-pulse rounded-xl border border-amber-500/50 bg-amber-500/15 p-3 text-amber-900 dark:text-amber-200">
              <p className="font-semibold">
                {t("steps.warningTitle")}
              </p>
              <p className="mt-1 text-xs">
                {t("steps.warningText")}
              </p>
            </div>
          )}

          {[
            {
              label: t("steps.step1Label"),
              detail: t("steps.step1Detail"),
              done: true,
              action: null,
            },
            {
              label: t("steps.step2Label"),
              detail: t("steps.step2Detail"),
              done: true,
              action: null,
            },
            {
              label: t("steps.step3Label"),
              detail: t("steps.step3Detail"),
              done: Boolean(raffle.draw_commitment),
              // El botón vive acá y no solo en la fila de acciones: el paso que
              // dice «Pendiente» tiene que traer la acción al lado.
              action: raffle.draw_commitment ? null : (
                <span className="inline-flex animate-pulse">
                  <PublishCommitmentButton raffleId={raffle.id} />
                </span>
              ),
            },
            {
              label: t("steps.step4Label"),
              detail:
                (soldCount ?? 0) > 0
                  ? t("steps.step4Ready")
                  : t("steps.step4NoSales"),
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
                  {step.done ? t("steps.statusReady") : t("steps.statusPending")}
                </Badge>
                {step.action}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-2 text-xs">
            <LocaleLink
              href={`/admin/sorteos/${raffle.id}/numeros`}
              className="text-amber-700 underline-offset-4 hover:underline dark:text-amber-400"
            >
              {t("actions.manageNumbers")}
            </LocaleLink>
            <LocaleLink
              href={`/admin/sorteos/${raffle.id}/premios`}
              className="text-amber-700 underline-offset-4 hover:underline dark:text-amber-400"
            >
              {t("actions.prizes")}
            </LocaleLink>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("reservations.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("reservations.description")}
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
