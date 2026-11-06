import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  Gift,
  ShieldCheck,
  Star,
  Ticket,
  Trophy,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { parseLandingContent } from "@/lib/landing";
import { collectSoldNumbers } from "@/lib/raffle-numbers";
import { sortFeaturedFirst } from "@/lib/featured";
import { averageRating, formatRating } from "@/lib/reviews";
import type { PublicQuestion } from "@/lib/questions";
import { maybeAutoDrawRaffle, maybeNotifyManualDraw } from "@/lib/auto-draw";
import { maybeReleaseExpiredReservations } from "@/lib/release-expired";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DrawVerifier } from "@/components/DrawVerifier";
import { BarraConfianza } from "@/components/BarraConfianza";
import { NumbersGrid } from "@/components/NumbersGrid";
import { OrganizerCard } from "@/components/OrganizerCard";
import { OrganizerContact } from "@/components/OrganizerContact";
import { PageViewTracker } from "@/components/PageViewTracker";
import { PrizeCard } from "@/components/PrizeCard";
import { RaffleCountdown } from "@/components/RaffleCountdown";
import { RaffleLanding } from "@/components/RaffleLanding";
import { RaffleMiniCard } from "@/components/RaffleMiniCard";
import { RaffleQnA } from "@/components/RaffleQnA";
import { RaffleVisitTracker } from "@/components/RaffleVisitTracker";
import { ReportRaffleButton } from "@/components/ReportRaffleButton";
import { ShareButton } from "@/components/ShareButton";
import { formatDateTime, formatNumber, formatPrice } from "@/lib/utils";
import { calcularConfianza } from "@/lib/confianza";
import { cargarSenalesConfianza } from "@/lib/confianza-senales";
import type { Prize, PublicOrganizer, Raffle, RaffleWinner } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusLabel: Record<Raffle["status"], string> = {
  active: "Activo",
  closed: "Cerrado",
  drawn: "Sorteado",
  cancelled: "Cancelado",
};

/**
 * Metadata por sorteo: es lo que se ve al compartir el link por WhatsApp o
 * redes. No incluye el nombre del ganador (PII): tÃ­tulo, premio y fecha.
 */
export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const supabase = createClient();
  const { data: raffle } = await supabase
    .from("raffles")
    .select(
      "title, description, cover_image_url, draw_date, price_per_number",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!raffle) {
    return { title: "Sorteo no encontrado | Gadu Sorteos" };
  }

  const description = raffle.description?.trim()
    ? String(raffle.description).trim().slice(0, 160)
    : `ParticipÃ¡ por ${raffle.title} en Gadu Sorteos. Precio por nÃºmero: ${formatPrice(
        Number(raffle.price_per_number),
      )}. Sorteo: ${formatDateTime(raffle.draw_date)}.`;

  const images = raffle.cover_image_url
    ? [{ url: raffle.cover_image_url as string }]
    : undefined;

  return {
    title: `${raffle.title} | Gadu Sorteos`,
    description,
    openGraph: {
      title: raffle.title,
      description,
      type: "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: raffle.title,
      description,
      images: images?.map((image) => image.url),
    },
  };
}

export default async function RafflePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const isDev = process.env.NODE_ENV === "development";

  let { data: raffle } = await supabase
    .from("raffles")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!raffle) notFound();

  // Red de seguridad de reservas vencidas: en Vercel Hobby el cron sÃ³lo corre
  // una vez por dÃ­a, asÃ­ que un hold vencido puede quedar tomado 24 h. Se
  // libera al abrir el sorteo, con gate de un minuto por instancia. Tiene que
  // ir ANTES de leer los nÃºmeros para que la grilla los muestre disponibles.
  try {
    await maybeReleaseExpiredReservations();
  } catch (error) {
    console.error("[reservas] red de seguridad en pÃ¡gina pÃºblica:", error);
  }

  // Fallback perezoso del sorteo automÃ¡tico: si la hora ya pasÃ³ y nadie lo
  // ejecutÃ³ (cron caÃ­do, deploy, etc.), se resuelve al abrir la pÃ¡gina.
  if (
    raffle.auto_draw &&
    raffle.status !== "drawn" &&
    new Date(raffle.draw_date).getTime() <= Date.now()
  ) {
    try {
      const drawnNow = await maybeAutoDrawRaffle(raffle.id as string);
      if (drawnNow) {
        const { data: refreshed } = await supabase
          .from("raffles")
          .select("*")
          .eq("id", params.id)
          .single();
        if (refreshed) raffle = refreshed;
      }
    } catch (error) {
      console.error("[auto-draw] fallback en pÃ¡gina pÃºblica:", error);
    }
  }

  // En modo manual, el aviso al organizador tambiÃ©n se puede disparar al abrir
  // el sorteo (una sola vez; el cron hace lo mismo con mÃ¡s frecuencia).
  if (
    !raffle.auto_draw &&
    raffle.status !== "drawn" &&
    new Date(raffle.draw_date).getTime() <= Date.now()
  ) {
    try {
      await maybeNotifyManualDraw(raffle.id as string);
    } catch (error) {
      console.error("[manual-draw] aviso en pÃ¡gina pÃºblica:", error);
    }
  }

  // Tracking de visitas para las analÃ­ticas del organizador.
  //
  // Antes contaba CUALQUIER render: cada prefetch del router de Next, cada
  // revalidaciÃ³n y cada recarga sumaban una visita, asÃ­ que el nÃºmero que veÃ­a
  // el organizador salÃ­a inflado y la "conversiÃ³n visitas â†’ pago" quedaba
  // artificialmente baja. Ahora sÃ³lo cuenta una navegaciÃ³n real.
  //
  // El error se lee: `insert` de supabase no lanza, devuelve `{ error }`, asÃ­
  // que el `try/catch` anterior no atrapaba nada y un fallo de RLS o una tabla
  // ausente se perdÃ­an en silencio.
  const requestHeaders = headers();
  const isPrefetch = Boolean(
    requestHeaders.get("next-router-prefetch") ??
      requestHeaders.get("sec-purpose") ??
      requestHeaders.get("purpose"),
  );
  const fetchMode = requestHeaders.get("sec-fetch-mode");
  const isNavigation = fetchMode === null || fetchMode === "navigate";

  if (raffle.status === "active" && !isPrefetch && isNavigation) {
    const { error: visitError } = await supabase
      .from("raffle_visits")
      .insert({ raffle_id: raffle.id });

    // Sin tracking disponible (migraciÃ³n 0026 pendiente): no rompe la pÃ¡gina,
    // pero deja de ser invisible.
    if (visitError) {
      console.warn("[visitas] no se pudo registrar:", visitError.message);
    }
  }

  const { data: prizes } = await supabase
    .from("prizes")
    .select("*")
    .eq("raffle_id", params.id)
    .order("position", { ascending: true });

  // Perfil pÃºblico del organizador: se lee de la vista `public_organizers`
  // (migraciÃ³n 0030), que no expone email, telÃ©fono ni datos del KYC. Anon ya
  // no tiene SELECT sobre `profiles`.
  const { data: organizer } = raffle.created_by
    ? await supabase
        .from("public_organizers")
        .select("*")
        .eq("id", raffle.created_by)
        .single()
    : { data: null };

  const { data: organizerRatings } = raffle.created_by
    ? await supabase
        .from("public_reviews")
        .select("rating")
        .eq("organizer_id", raffle.created_by)
        .limit(1000)
    : { data: [] as { rating: number }[] };

  const ratingCount = organizerRatings?.length ?? 0;
  const ratingAverage = averageRating(
    (organizerRatings ?? []) as { rating: number }[],
  );

  // SemÃ¡foro de confianza (lib/confianza.ts): KYC, sorteos completados,
  // cancelaciones, deuda y reseÃ±as verificadas. No es el promedio de estrellas.
  const confianza = raffle.created_by
    ? calcularConfianza(await cargarSenalesConfianza(supabase, raffle.created_by))
    : null;

  // Listado vendido para el verificador: es pÃºblico por RLS (solo nÃºmeros).
  // Paginado: un `select` sin paginar devuelve como mÃ¡ximo `max_rows` (1000) y
  // el verificador recalcularÃ­a el hash con una lista incompleta.
  const soldNumbers =
    raffle.status === "drawn" && raffle.draw_seed
      ? await collectSoldNumbers(async (from, to) => {
          const { data, error } = await supabase
            .from("raffle_numbers")
            .select("number")
            .eq("raffle_id", raffle.id)
            .eq("status", "sold")
            .order("number", { ascending: true })
            .range(from, to);

          return { data: (data as { number: number }[] | null) ?? null, error };
        })
      : [];

  const landingBlocks = parseLandingContent(raffle.landing_content);

  // InvitaciÃ³n a la home: otros sorteos activos, con el destacado primero
  // (decisiÃ³n 2026-11-04: un solo destacado). `select("*")` funciona igual si
  // 0066 no estÃ¡ aplicada.
  const { data: otherRafflesData } = await supabase
    .from("raffles")
    .select("*")
    .eq("status", "active")
    .neq("id", raffle.id)
    .order("created_at", { ascending: false })
    .limit(6);

  const otherRaffles = sortFeaturedFirst((otherRafflesData ?? []) as Raffle[]);

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  let viewerRole: string | null = null;
  if (viewer) {
    const { data: viewerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", viewer.id)
      .maybeSingle();
    viewerRole = (viewerProfile?.role as string | null) ?? null;
  }

  const { data: questionRows } = await supabase
    .from("public_questions")
    .select("id, question, answer, created_at, answered_at")
    .eq("raffle_id", raffle.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // `public_questions` no expone user_id. Para saber cuÃ¡les son del visitante
  // se consultan solo sus propios IDs contra la tabla autenticada.
  const myQuestionIds = new Set<string>();
  if (viewer) {
    const { data: mine } = await supabase
      .from("raffle_questions")
      .select("id")
      .eq("raffle_id", raffle.id)
      .eq("user_id", viewer.id);
    for (const row of mine ?? []) {
      if (row.id) myQuestionIds.add(row.id as string);
    }
  }

  const questions: PublicQuestion[] = (questionRows ?? []).map((row) => ({
    id: row.id as string,
    question: row.question as string,
    answer: (row.answer as string | null) ?? null,
    createdAt: row.created_at as string,
    answeredAt: (row.answered_at as string | null) ?? null,
    isMine: myQuestionIds.has(row.id as string),
  }));

  const canModerateQna = Boolean(
    viewer &&
      (viewerRole === "superadmin" || raffle.created_by === viewer.id),
  );

  const [{ count: soldTotal }, { count: numbersTotal }] = await Promise.all([
    supabase
      .from("raffle_numbers")
      .select("*", { count: "exact", head: true })
      .eq("raffle_id", raffle.id)
      .eq("status", "sold"),
    supabase
      .from("raffle_numbers")
      .select("*", { count: "exact", head: true })
      .eq("raffle_id", raffle.id),
  ]);

  const soldPercent =
    numbersTotal && numbersTotal > 0
      ? Math.min(100, Math.round(((soldTotal ?? 0) / numbersTotal) * 100))
      : 0;

  const { data: winnerRows } =
    raffle.status === "drawn"
      ? await supabase
          .from("raffle_winners")
          .select("position, number, user_name, prize_title, winner_hash")
          .eq("raffle_id", raffle.id)
          .order("position", { ascending: true })
      : { data: null };

  const raffleWinners = (winnerRows ?? []) as RaffleWinner[];

  return (
    <div className="space-y-10">
      <RaffleVisitTracker raffleId={raffle.id} />
      <PageViewTracker path={`/sorteos/${raffle.id}`} />
      <section className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-hairline bg-panel-2">
          {raffle.cover_image_url ? (
            <Image
              src={raffle.cover_image_url}
              alt={raffle.title}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <Gift className="h-7 w-7 text-fg-subtle" aria-hidden="true" />
              <span className="eyebrow">Premio en juego</span>
            </div>
          )}
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <Badge
              variant={
                raffle.status === "active"
                  ? "success"
                  : raffle.status === "closed"
                    ? "warning"
                    : "secondary"
              }
            >
              {statusLabel[raffle.status as Raffle["status"]]}
            </Badge>
            <Badge variant="secondary" className="bg-canvas/85 ring-1 ring-hairline">
              {raffle.auto_draw ? "AutomÃ¡tico" : "Manual"}
            </Badge>
          </div>
          <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-canvas/85 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted ring-1 ring-hairline">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Resultado verificable
          </span>
        </div>

        <div className="space-y-5">
          <p className="eyebrow-gold">Sorteo verificable</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-[-0.025em] sm:text-4xl">
              {raffle.title}
            </h1>
            <Badge variant="secondary">
              {statusLabel[raffle.status as Raffle["status"]]}
            </Badge>
          </div>
          <ShareButton sorteoId={raffle.id} titulo={raffle.title} />
          {raffle.status === "active" && viewer?.id !== raffle.created_by && (
            <ReportRaffleButton raffleId={raffle.id} isLoggedIn={Boolean(viewer)} />
          )}
          {raffle.description && (
            <p className="max-w-xl text-[15px] leading-relaxed text-fg-subtle">
              {raffle.description}
            </p>
          )}

          {raffle.status === "cancelled" && (
            <div className="max-w-xl rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <p className="font-semibold">Sorteo cancelado</p>
              <p className="mt-1 text-muted-foreground">
                {raffle.cancellation_reason ||
                  "El organizador cancelÃ³ este sorteo."}{" "}
                Si compraste nÃºmeros, contactÃ¡ al organizador para coordinar la
                devoluciÃ³n.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-5 rounded-lg border border-hairline bg-panel-1 p-4 text-[13px]">
            <span className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-fg-subtle" aria-hidden="true" />
              <span>
                <span className="block font-mono text-[11px] uppercase tracking-[0.1em] text-fg-subtle">
                  Fecha del sorteo
                </span>
                {formatDateTime(raffle.draw_date)}
                <span className="mt-0.5 block">
                  <RaffleCountdown
                    drawDate={raffle.draw_date}
                    status={raffle.status as Raffle["status"]}
                  />
                </span>
              </span>
            </span>
            <span className="hidden h-9 w-px bg-hairline sm:block" />
            <span>
              <span className="block font-mono text-[11px] uppercase tracking-[0.1em] text-fg-subtle">
                Precio por nÃºmero
              </span>
              <span className="font-mono text-xl text-fg">
                {formatPrice(Number(raffle.price_per_number))}
              </span>
            </span>
          </div>

          {(raffle.status === "active" || raffle.status === "closed") && (
            <p className="max-w-xl rounded-lg border border-hairline bg-panel-1/60 p-3 text-[13px] leading-relaxed text-fg-subtle">
              {raffle.auto_draw
                ? "Sorteo automÃ¡tico: se ejecuta solo a la fecha y hora programadas; el resultado se publica al confirmarse."
                : "Sorteo manual: el organizador lo ejecuta a la fecha y hora programadas; el resultado se publica al confirmarse."}
            </p>
          )}

          {numbersTotal && numbersTotal > 0 && (
            <div className="max-w-xl space-y-2">
              <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
                <span>
                  {(soldTotal ?? 0).toLocaleString("es-AR")} de{" "}
                  {numbersTotal.toLocaleString("es-AR")} nÃºmeros vendidos
                </span>
                <span className="text-fg">{soldPercent}%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-panel-3">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${soldPercent}%` }}
                />
              </div>
            </div>
          )}

          {raffle.min_tickets_required > 0 && (
            <div
              className={
                (soldTotal ?? 0) >= raffle.min_tickets_required
                  ? "max-w-xl rounded-xl border border-emerald-600/30 bg-emerald-500/5 p-3 text-xs"
                  : "max-w-xl rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs"
              }
            >
              <p className="font-semibold">
                MÃ­nimo para realizarse:{" "}
                {raffle.min_tickets_required.toLocaleString("es-AR")} nÃºmeros
                vendidos
              </p>
              <p className="mt-1 text-muted-foreground">
                Vendidos actualmente: {(soldTotal ?? 0).toLocaleString("es-AR")}
                {". "}
                {raffle.if_not_met === "extend_date"
                  ? "Si no se alcanza, se reprograma la fecha."
                  : "Si no se alcanza, se cancela y se devuelve el dinero."}
              </p>
              {(soldTotal ?? 0) < raffle.min_tickets_required && (
                <p className="mt-1 font-medium text-amber-800 dark:text-amber-300">
                  Faltan{" "}
                  {(raffle.min_tickets_required - (soldTotal ?? 0)).toLocaleString(
                    "es-AR",
                  )}{" "}
                  para habilitar el sorteo.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {raffle.status === "active" && (
              <Link
                href="#elegir-numeros"
                className={buttonVariants({ size: "lg" })}
              >
                <Ticket className="mr-1.5 h-4 w-4" />
                Elegir mis nÃºmeros
              </Link>
            )}
            {raffle.status === "drawn" && (
              <Link
                href={`/sorteos/${raffle.id}/verificar`}
                className={buttonVariants({ size: "lg" })}
              >
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                Verificar resultado
              </Link>
            )}
            <Link
              href={`/sorteos/${raffle.id}/en-vivo`}
              className="btn-ghost-strong"
            >
              Sala en vivo
            </Link>
          </div>

          {raffle.status === "drawn" && raffle.winner_number != null && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-500/25 bg-brand-500/[0.06] p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-500/10 text-brand-accent ring-1 ring-brand-500/20">
                  <Trophy className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-subtle">
                    Ganador
                  </p>
                  <p className="font-semibold">
                    {raffle.winner_name ?? "AnÃ³nimo"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-subtle">
                  NÃºmero
                </p>
                <p className="font-mono text-2xl font-medium text-brand-accent">
                  {formatNumber(raffle.winner_number)}
                </p>
              </div>
            </div>
          )}

          {organizer && (
            <>
              <OrganizerCard
                organizer={organizer as PublicOrganizer}
                href={
                  organizer.slug
                    ? `/organizador/${organizer.slug}`
                    : raffle.created_by
                      ? `/organizador/${raffle.created_by}`
                      : null
                }
              />
              {confianza && (
                <BarraConfianza
                  confianza={confianza}
                  hrefResenas={
                    organizer.slug
                      ? `/organizador/${organizer.slug}#resenas`
                      : raffle.created_by
                        ? `/organizador/${raffle.created_by}#resenas`
                        : undefined
                  }
                />
              )}
              {ratingCount > 0 && (
                <Link
                  href={`/organizador/${
                    organizer.slug ?? raffle.created_by
                  }#resenas`}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
                >
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span className="font-semibold">
                    {formatRating(ratingAverage)}
                  </span>
                  <span>
                    Â· {ratingCount} reseÃ±a{ratingCount === 1 ? "" : "s"}
                  </span>
                </Link>
              )}
            </>
          )}
        </div>
      </section>

      {raffleWinners.length > 1 && (
        <section className="space-y-4 rounded-xl border border-hairline bg-panel-1 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-semibold">
                Ganadores por premio
              </h2>
              <p className="text-[13px] text-fg-subtle">
                Resultado publicado automÃ¡ticamente y congelado. Cada premio
                conserva su hash.
              </p>
            </div>
            <Link
              href={`/sorteos/${raffle.id}/verificar`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Verificar resultados
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {raffleWinners.map((winner) => (
              <div
                key={winner.position}
                className="rounded-lg border border-brand-500/25 bg-brand-500/[0.06] p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-subtle">
                      {winner.position === 1
                        ? "1.er premio"
                        : `${winner.position}Âº premio`}
                    </p>
                    <p className="truncate font-semibold">
                      {winner.prize_title ?? "Premio"}
                    </p>
                    <p className="text-[13px] text-fg-subtle">
                      {winner.user_name ?? "Ganador anÃ³nimo"}
                    </p>
                  </div>
                  <p className="font-mono text-2xl font-medium text-brand-accent">
                    {String(winner.number).padStart(4, "0")}
                  </p>
                </div>
                <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                  {winner.winner_hash}
                </p>
              </div>
            ))}
          </div>

          {raffle.results_hash && (
            <p className="break-all text-xs text-muted-foreground">
              results_hash:{" "}
              <code className="font-mono">{raffle.results_hash}</code>
            </p>
          )}
        </section>
      )}

      {raffle.status !== "drawn" && raffle.draw_commitment && (
        <section className="space-y-3 rounded-lg border border-hairline bg-panel-1/60 p-5">
          <h2 className="text-lg font-semibold">
            Compromiso del sorteo publicado
          </h2>
          <p className="text-sm text-muted-foreground">
            El organizador publicÃ³, antes del sorteo, el hash de una semilla
            secreta. Nadie conoce la semilla hasta que se sortea: cuando se
            revele, cualquiera podrÃ¡ comprobar que el ganador se calculÃ³ a partir
            de ella y de los nÃºmeros vendidos. El compromiso ya no se puede
            cambiar.
          </p>
          <div className="space-y-1 text-xs">
            <p className="font-medium">Compromiso (hash de la semilla)</p>
            <code className="block break-all rounded-md border border-hairline bg-panel-2 p-3 font-mono">
              {raffle.draw_commitment}
            </code>
            {raffle.draw_commitment_at && (
              <p className="text-muted-foreground">
                Publicado: {formatDateTime(raffle.draw_commitment_at)}
              </p>
            )}
          </div>
        </section>
      )}

      {raffle.status === "drawn" &&
        raffle.numbers_hash &&
        raffle.result_hash && (
          <section className="space-y-4 rounded-xl border border-hairline bg-panel-1 p-5">
            <div className="space-y-1">
              <h2 className="font-display text-xl font-semibold">
                Huellas del sorteo (verificable)
              </h2>
              <p className="text-sm text-muted-foreground">
                Estas huellas SHA-256 se calcularon en el momento del sorteo y
                quedaron congeladas. AdemÃ¡s, la semilla del sorteo se publicÃ³
                comprometida antes de sortear y ahora estÃ¡ revelada: con el
                listado de nÃºmeros vendidos que se muestra en esta pÃ¡gina,
                cualquiera puede recomputar el ganador y comprobar que no se
                eligiÃ³ despuÃ©s de conocer los nÃºmeros.
              </p>
              {raffle.hashes_at && (
                <p className="text-xs text-muted-foreground">
                  Calculadas: {formatDateTime(raffle.hashes_at)} Â· Sorteo:{" "}
                  <span className="font-mono">{raffle.id}</span>
                </p>
              )}
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <p className="font-medium">
                  Huella del listado vendido (<code>numbers_hash</code>)
                </p>
                <code className="block break-all rounded-md border border-hairline bg-panel-2 p-3 font-mono">
                  {raffle.numbers_hash}
                </code>
              </div>
              <div className="space-y-1">
                <p className="font-medium">
                  Huella del resultado (<code>result_hash</code>)
                </p>
                <code className="block break-all rounded-md border border-hairline bg-panel-2 p-3 font-mono">
                  {raffle.result_hash}
                </code>
              </div>
              {raffle.draw_commitment && (
                <div className="space-y-1">
                  <p className="font-medium">
                    Compromiso publicado antes del sorteo{" "}
                    (<code>draw_commitment</code>)
                  </p>
                  <code className="block break-all rounded-md border border-hairline bg-panel-2 p-3 font-mono">
                    {raffle.draw_commitment}
                  </code>
                </div>
              )}
              {raffle.draw_seed && (
                <div className="space-y-1">
                  <p className="font-medium">
                    Semilla revelada (<code>draw_seed</code>)
                  </p>
                  <code className="block break-all rounded-md border border-hairline bg-panel-2 p-3 font-mono">
                    {raffle.draw_seed}
                  </code>
                  {raffle.draw_seed_revealed_at && (
                    <p className="text-muted-foreground">
                      Revelada: {formatDateTime(raffle.draw_seed_revealed_at)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {raffle.draw_seed &&
              raffle.draw_commitment &&
              raffle.winner_number != null && (
                <DrawVerifier
                  raffleId={raffle.id}
                  seed={raffle.draw_seed}
                  commitment={raffle.draw_commitment}
                  winnerNumber={raffle.winner_number}
                  numbersHash={raffle.numbers_hash!}
                  resultHash={raffle.result_hash!}
                  soldNumbers={soldNumbers}
                />
              )}

            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                CÃ³mo verificarlo
              </summary>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
                <li>
                  <strong>Compromiso:</strong> calculÃ¡ el SHA-256 (hexadecimal) de{" "}
                  <code className="break-all font-mono">
                    gadu:v1|raffle:{raffle.id}|seed:&lt;semilla&gt;
                  </code>
                  . Tiene que coincidir con <code>draw_commitment</code>: eso
                  prueba que la semilla ya estaba fijada antes del sorteo.
                </li>
                <li>
                  <strong>Listado vendido:</strong> tomÃ¡ los nÃºmeros vendidos de
                  este sorteo, ordenados de menor a mayor, separados por coma y
                  sin espacios: <code className="font-mono">n1,n2,...,nN</code>.
                </li>
                <li>
                  <strong>Ganador:</strong> calculÃ¡ el SHA-256 de{" "}
                  <code className="break-all font-mono">
                    gadu:v1|raffle:{raffle.id}|seed:&lt;semilla&gt;|numbers:n1,n2,...,nN
                  </code>
                  . TomÃ¡ sus primeros 15 caracteres hexadecimales como nÃºmero,
                  dividilo por la cantidad de nÃºmeros vendidos y usÃ¡ el resto
                  como posiciÃ³n (empezando en 0) del listado ordenado: ese es el
                  nÃºmero ganador y tiene que coincidir con el publicado.
                </li>
                <li>
                  <strong>Huellas:</strong> el SHA-256 de{" "}
                  <code className="break-all font-mono">
                    gadu:v1|raffle:{raffle.id}|numbers:n1,n2,...,nN
                  </code>{" "}
                  debe ser <code>numbers_hash</code>, y el de{" "}
                  <code className="break-all font-mono">
                    gadu:v1|raffle:{raffle.id}|winner:{raffle.winner_number}
                    |numbers:n1,n2,...,nN
                  </code>{" "}
                  debe ser <code>result_hash</code>.
                </li>
                <li>
                  Cualquier diferencia significa que la semilla, el listado o el
                  resultado se modificaron despuÃ©s del sorteo.
                </li>
              </ol>
            </details>
          </section>
        )}

      {landingBlocks.length > 0 && (
        <RaffleLanding
          blocks={landingBlocks}
          showCta={raffle.status === "active"}
        />
      )}

      {raffle.status === "active" && (
        <section id="elegir-numeros" className="scroll-mt-24 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              ElegÃ­ tus nÃºmeros
            </h2>
            {isDev && (
              <span className="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-medium text-yellow-700 dark:text-yellow-300">
                Modo simulaciÃ³n de pagos activo
              </span>
            )}
          </div>
          <div className="grid gap-2 rounded-lg border border-hairline bg-panel-1 p-3 text-[13px] sm:grid-cols-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-[11px] font-medium text-primary-foreground">
                1
              </span>
              ElegÃ­ tus nÃºmeros
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-panel-3 font-mono text-[11px] font-medium text-fg-subtle">
                2
              </span>
              {raffle.payment_type === "transferencia"
                ? "TransferÃ­ el total"
                : "PagÃ¡ online"}
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-panel-3 font-mono text-[11px] font-medium text-fg-subtle">
                3
              </span>
              {raffle.payment_type === "transferencia"
                ? "EnviÃ¡ el comprobante"
                : "ConfirmÃ¡ el pago"}
            </div>
          </div>
          <NumbersGrid
            raffleId={raffle.id}
            raffleTitle={raffle.title}
            pricePerNumber={Number(raffle.price_per_number)}
            raffleStatus={raffle.status}
            isDev={isDev}
            paymentType={raffle.payment_type}
            transferInfo={{
              alias: raffle.transfer_alias,
              cbu: raffle.transfer_cbu,
              bank: raffle.transfer_bank,
              // El WhatsApp sale del sorteo; el perfil ya no expone telÃ©fono.
              whatsapp: raffle.whatsapp_contact || null,
              // Aviso propio del sorteo (0090): se ve antes de copiar el alias.
              note: raffle.transfer_note || null,
            }}
          />

          {raffle.payment_type === "transferencia" && (
            <div className="rounded-lg border border-hairline bg-panel-1/60 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-subtle">
                Datos para transferir cuando reserves
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {raffle.transfer_alias && (
                  <div>
                    <p className="font-mono text-[11px] text-fg-subtle">Alias</p>
                    <p className="font-mono text-[13px] font-medium text-fg">
                      {raffle.transfer_alias}
                    </p>
                  </div>
                )}
                {raffle.transfer_cbu && (
                  <div>
                    <p className="font-mono text-[11px] text-fg-subtle">CBU</p>
                    <p className="font-mono text-[13px] font-medium text-fg">
                      {raffle.transfer_cbu}
                    </p>
                  </div>
                )}
                {raffle.transfer_bank && (
                  <div>
                    <p className="font-mono text-[11px] text-fg-subtle">Banco</p>
                    <p className="font-mono text-[13px] font-medium text-fg">
                      {raffle.transfer_bank}
                    </p>
                  </div>
                )}
              </div>
              <p className="mt-3 text-[12px] text-fg-subtle">
                Primero elegÃ­ tus nÃºmeros y reservÃ¡: el comprobante se envÃ­a
                despuÃ©s por WhatsApp.
              </p>
            </div>
          )}
        </section>
      )}

      <section className="space-y-4 border-t border-hairline pt-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Premios
        </h2>
        {prizes && prizes.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {prizes.map((prize: Prize) => (
              <PrizeCard key={prize.id} prize={prize} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">
            Los premios se publicarÃ¡n pronto.
          </p>
        )}
      </section>

      <RaffleQnA
        raffleId={raffle.id}
        questions={questions}
        isLoggedIn={Boolean(viewer)}
        canModerate={canModerateQna}
      />

      {otherRaffles.length > 0 && (
        <section className="space-y-4 border-t border-hairline pt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">MÃ¡s sorteos</p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">
                SeguÃ­ participando
              </h2>
              <p className="mt-1 text-[13px] text-fg-subtle">
                Otros sorteos publicados en Gadu. Los destacados aparecen
                primero.
              </p>
            </div>
            <Link
              href="/"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Ver todos los sorteos
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {otherRaffles.map((other) => (
              <RaffleMiniCard key={other.id} raffle={other} />
            ))}
          </div>
        </section>
      )}

      {organizer && (
        <OrganizerContact
          organizer={{
            phone: raffle.whatsapp_contact,
            instagram_url: null,
          }}
        />
      )}
    </div>
  );
}
