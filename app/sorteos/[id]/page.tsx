import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CalendarDays, ShieldCheck, Star, Ticket, Trophy } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { parseLandingContent } from "@/lib/landing";
import { averageRating, formatRating } from "@/lib/reviews";
import type { PublicQuestion } from "@/lib/questions";
import { maybeAutoDrawRaffle, maybeNotifyManualDraw } from "@/lib/auto-draw";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DrawVerifier } from "@/components/DrawVerifier";
import { NumbersGrid } from "@/components/NumbersGrid";
import { OrganizerCard } from "@/components/OrganizerCard";
import { OrganizerContact } from "@/components/OrganizerContact";
import { PrizeCard } from "@/components/PrizeCard";
import { RaffleLanding } from "@/components/RaffleLanding";
import { RaffleQnA } from "@/components/RaffleQnA";
import { RaffleVisitTracker } from "@/components/RaffleVisitTracker";
import { ShareButton } from "@/components/ShareButton";
import { formatDateTime, formatPrice } from "@/lib/utils";
import type { Prize, PublicOrganizer, Raffle, RaffleWinner } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusLabel: Record<Raffle["status"], string> = {
  active: "Activo",
  closed: "Cerrado",
  drawn: "Sorteado",
};

/**
 * Metadata por sorteo: es lo que se ve al compartir el link por WhatsApp o
 * redes. No incluye el nombre del ganador (PII): título, premio y fecha.
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
    : `Participá por ${raffle.title} en Gadu Sorteos. Precio por número: ${formatPrice(
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

  // Fallback perezoso del sorteo automático: si la hora ya pasó y nadie lo
  // ejecutó (cron caído, deploy, etc.), se resuelve al abrir la página.
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
      console.error("[auto-draw] fallback en página pública:", error);
    }
  }

  // En modo manual, el aviso al organizador también se puede disparar al abrir
  // el sorteo (una sola vez; el cron hace lo mismo con más frecuencia).
  if (
    !raffle.auto_draw &&
    raffle.status !== "drawn" &&
    new Date(raffle.draw_date).getTime() <= Date.now()
  ) {
    try {
      await maybeNotifyManualDraw(raffle.id as string);
    } catch (error) {
      console.error("[manual-draw] aviso en página pública:", error);
    }
  }

  // Tracking de visitas para las analíticas del organizador.
  //
  // Antes contaba CUALQUIER render: cada prefetch del router de Next, cada
  // revalidación y cada recarga sumaban una visita, así que el número que veía
  // el organizador salía inflado y la "conversión visitas → pago" quedaba
  // artificialmente baja. Ahora sólo cuenta una navegación real.
  //
  // El error se lee: `insert` de supabase no lanza, devuelve `{ error }`, así
  // que el `try/catch` anterior no atrapaba nada y un fallo de RLS o una tabla
  // ausente se perdían en silencio.
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

    // Sin tracking disponible (migración 0026 pendiente): no rompe la página,
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

  // Perfil público del organizador: se lee de la vista `public_organizers`
  // (migración 0030), que no expone email, teléfono ni datos del KYC. Anon ya
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
        .from("reviews")
        .select("rating")
        .eq("organizer_id", raffle.created_by)
        .limit(1000)
    : { data: [] as { rating: number }[] };

  const ratingCount = organizerRatings?.length ?? 0;
  const ratingAverage = averageRating(
    (organizerRatings ?? []) as { rating: number }[],
  );

  // Listado vendido para el verificador: es público por RLS (solo números).
  const { data: soldNumbersData } =
    raffle.status === "drawn" && raffle.draw_seed
      ? await supabase
          .from("raffle_numbers")
          .select("number")
          .eq("raffle_id", raffle.id)
          .eq("status", "sold")
          .order("number", { ascending: true })
      : { data: null };

  const soldNumbers = ((soldNumbersData ?? []) as { number: number }[]).map(
    (row) => row.number,
  );

  const landingBlocks = parseLandingContent(raffle.landing_content);

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
    .from("raffle_questions")
    .select("id, user_id, question, answer, created_at, answered_at")
    .eq("raffle_id", raffle.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const questions: PublicQuestion[] = (questionRows ?? []).map((row) => ({
    id: row.id as string,
    question: row.question as string,
    answer: (row.answer as string | null) ?? null,
    createdAt: row.created_at as string,
    answeredAt: (row.answered_at as string | null) ?? null,
    isMine: Boolean(viewer && row.user_id === viewer.id),
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
    <div className="space-y-8">
      <RaffleVisitTracker raffleId={raffle.id} />
      <section className="grid gap-6 md:grid-cols-2">
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border bg-muted shadow-soft">
          {raffle.cover_image_url ? (
            <Image
              src={raffle.cover_image_url}
              alt={raffle.title}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-6xl">
              🛠️
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink/80 to-transparent" />
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
            <Badge className="border-transparent bg-ink/80 text-white">
              {raffle.auto_draw ? "Automático" : "Manual"}
            </Badge>
          </div>
          <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-ink/70 px-2.5 py-1 text-xs font-medium text-white/80">
            <ShieldCheck className="h-3.5 w-3.5" />
            Resultado verificable
          </span>
        </div>

        <div className="space-y-4">
          <p className="font-mono text-xs uppercase tracking-widest text-brand-700 dark:text-brand-300">
            Sorteo verificable
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {raffle.title}
            </h1>
            <Badge variant="secondary">
              {statusLabel[raffle.status as Raffle["status"]]}
            </Badge>
          </div>
          <ShareButton sorteoId={raffle.id} titulo={raffle.title} />
          {raffle.description && (
            <p className="max-w-xl text-muted-foreground">
              {raffle.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-3 text-sm shadow-soft">
            <span className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span>
                <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                  Fecha del sorteo
                </span>
                {formatDateTime(raffle.draw_date)}
              </span>
            </span>
            <span className="hidden h-8 w-px bg-border sm:block" />
            <span>
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                Precio por número
              </span>
              <span className="font-display text-xl font-bold">
                {formatPrice(Number(raffle.price_per_number))}
              </span>
            </span>
          </div>

          {raffle.status !== "drawn" && (
            <p className="max-w-xl rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              {raffle.auto_draw
                ? "Sorteo automático: se ejecuta solo a la fecha y hora programadas; el resultado se publica al confirmarse."
                : "Sorteo manual: el organizador lo ejecuta a la fecha y hora programadas; el resultado se publica al confirmarse."}
            </p>
          )}

          {numbersTotal && numbersTotal > 0 && (
            <div className="max-w-xl space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {soldTotal ?? 0} de {numbersTotal} números vendidos
                </span>
                <span className="font-mono font-semibold text-foreground">
                  {soldPercent}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
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
                Mínimo para realizarse:{" "}
                {raffle.min_tickets_required.toLocaleString("es-AR")} números
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
                Elegir mis números
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
              className="inline-flex h-11 items-center rounded-lg border border-border bg-background px-5 text-sm font-semibold text-foreground transition hover:bg-accent"
            >
              Sala en vivo
            </Link>
          </div>

          {raffle.status === "drawn" && raffle.winner_number != null && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/15 text-brand-700 dark:text-brand-300">
                  <Trophy className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Ganador
                  </p>
                  <p className="font-semibold">
                    {raffle.winner_name ?? "Anónimo"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Número
                </p>
                <p className="font-mono text-2xl font-bold text-brand-700 dark:text-brand-300">
                  {raffle.winner_number}
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
                    · {ratingCount} reseña{ratingCount === 1 ? "" : "s"}
                  </span>
                </Link>
              )}
            </>
          )}
        </div>
      </section>

      {raffleWinners.length > 1 && (
        <section className="space-y-4 rounded-xl border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-semibold">
                Ganadores por premio
              </h2>
              <p className="text-sm text-muted-foreground">
                Resultado publicado automáticamente y congelado. Cada premio
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
                className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {winner.position === 1
                        ? "1.er premio"
                        : `${winner.position}º premio`}
                    </p>
                    <p className="truncate font-semibold">
                      {winner.prize_title ?? "Premio"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {winner.user_name ?? "Ganador anónimo"}
                    </p>
                  </div>
                  <p className="font-mono text-2xl font-bold text-brand-800 dark:text-brand-200">
                    {String(winner.number).padStart(4, "0")}
                  </p>
                </div>
                <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
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
        <section className="space-y-3 rounded-xl border bg-muted/30 p-5">
          <h2 className="text-lg font-semibold">
            Compromiso del sorteo publicado
          </h2>
          <p className="text-sm text-muted-foreground">
            El organizador publicó, antes del sorteo, el hash de una semilla
            secreta. Nadie conoce la semilla hasta que se sortea: cuando se
            revele, cualquiera podrá comprobar que el ganador se calculó a partir
            de ella y de los números vendidos. El compromiso ya no se puede
            cambiar.
          </p>
          <div className="space-y-1 text-xs">
            <p className="font-medium">Compromiso (hash de la semilla)</p>
            <code className="block break-all rounded-md bg-muted/60 p-3 font-mono">
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
          <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">
                Huellas del sorteo (verificable)
              </h2>
              <p className="text-sm text-muted-foreground">
                Estas huellas SHA-256 se calcularon en el momento del sorteo y
                quedaron congeladas. Además, la semilla del sorteo se publicó
                comprometida antes de sortear y ahora está revelada: con el
                listado de números vendidos que se muestra en esta página,
                cualquiera puede recomputar el ganador y comprobar que no se
                eligió después de conocer los números.
              </p>
              {raffle.hashes_at && (
                <p className="text-xs text-muted-foreground">
                  Calculadas: {formatDateTime(raffle.hashes_at)} · Sorteo:{" "}
                  <span className="font-mono">{raffle.id}</span>
                </p>
              )}
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <p className="font-medium">
                  Huella del listado vendido (<code>numbers_hash</code>)
                </p>
                <code className="block break-all rounded-md bg-muted/60 p-3 font-mono">
                  {raffle.numbers_hash}
                </code>
              </div>
              <div className="space-y-1">
                <p className="font-medium">
                  Huella del resultado (<code>result_hash</code>)
                </p>
                <code className="block break-all rounded-md bg-muted/60 p-3 font-mono">
                  {raffle.result_hash}
                </code>
              </div>
              {raffle.draw_commitment && (
                <div className="space-y-1">
                  <p className="font-medium">
                    Compromiso publicado antes del sorteo{" "}
                    (<code>draw_commitment</code>)
                  </p>
                  <code className="block break-all rounded-md bg-muted/60 p-3 font-mono">
                    {raffle.draw_commitment}
                  </code>
                </div>
              )}
              {raffle.draw_seed && (
                <div className="space-y-1">
                  <p className="font-medium">
                    Semilla revelada (<code>draw_seed</code>)
                  </p>
                  <code className="block break-all rounded-md bg-muted/60 p-3 font-mono">
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
                Cómo verificarlo
              </summary>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
                <li>
                  <strong>Compromiso:</strong> calculá el SHA-256 (hexadecimal) de{" "}
                  <code className="break-all font-mono">
                    gadu:v1|raffle:{raffle.id}|seed:&lt;semilla&gt;
                  </code>
                  . Tiene que coincidir con <code>draw_commitment</code>: eso
                  prueba que la semilla ya estaba fijada antes del sorteo.
                </li>
                <li>
                  <strong>Listado vendido:</strong> tomá los números vendidos de
                  este sorteo, ordenados de menor a mayor, separados por coma y
                  sin espacios: <code className="font-mono">n1,n2,...,nN</code>.
                </li>
                <li>
                  <strong>Ganador:</strong> calculá el SHA-256 de{" "}
                  <code className="break-all font-mono">
                    gadu:v1|raffle:{raffle.id}|seed:&lt;semilla&gt;|numbers:n1,n2,...,nN
                  </code>
                  . Tomá sus primeros 15 caracteres hexadecimales como número,
                  dividilo por la cantidad de números vendidos y usá el resto
                  como posición (empezando en 0) del listado ordenado: ese es el
                  número ganador y tiene que coincidir con el publicado.
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
                  resultado se modificaron después del sorteo.
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
            <h2 className="text-xl font-semibold">Elegí tus números</h2>
            {isDev && (
              <span className="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-medium text-yellow-700 dark:text-yellow-300">
                Modo simulación de pagos activo
              </span>
            )}
          </div>
          <div className="grid gap-2 rounded-xl border bg-card p-3 text-sm shadow-soft sm:grid-cols-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-ink">
                1
              </span>
              Elegí tus números
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                2
              </span>
              {raffle.payment_type === "transferencia"
                ? "Transferí el total"
                : "Pagá online"}
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                3
              </span>
              {raffle.payment_type === "transferencia"
                ? "Enviá el comprobante"
                : "Confirmá el pago"}
            </div>
          </div>
          {raffle.payment_type === "transferencia" && (
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-sm font-semibold">Datos para transferencia</p>
              <div className="mt-2 grid gap-3 text-sm sm:grid-cols-3">
                {raffle.transfer_alias && (
                  <div>
                    <p className="text-muted-foreground">Alias</p>
                    <p className="font-mono font-semibold">
                      {raffle.transfer_alias}
                    </p>
                  </div>
                )}
                {raffle.transfer_cbu && (
                  <div>
                    <p className="text-muted-foreground">CBU</p>
                    <p className="font-mono font-semibold">
                      {raffle.transfer_cbu}
                    </p>
                  </div>
                )}
                {raffle.transfer_bank && (
                  <div>
                    <p className="text-muted-foreground">Banco</p>
                    <p className="font-semibold">{raffle.transfer_bank}</p>
                  </div>
                )}
              </div>
            </div>
          )}

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
              // El WhatsApp sale del sorteo; el perfil ya no expone teléfono.
              whatsapp: raffle.whatsapp_contact || null,
            }}
          />
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Premios</h2>
        {prizes && prizes.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {prizes.map((prize: Prize) => (
              <PrizeCard key={prize.id} prize={prize} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">
            Los premios se publicarán pronto.
          </p>
        )}
      </section>

      <RaffleQnA
        raffleId={raffle.id}
        questions={questions}
        isLoggedIn={Boolean(viewer)}
        canModerate={canModerateQna}
      />

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
