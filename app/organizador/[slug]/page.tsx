import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarDays, Star, Trophy, Ticket } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReviewSection } from "@/components/ReviewSection";
import {
  averageRating,
  formatRating,
  type PublicReview,
} from "@/lib/reviews";
import { formatDateTime, formatNumber, formatPrice } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Organizador | Gadu Sorteos",
  description: "Perfil público del organizador y sus sorteos.",
};

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface OrganizerRaffle {
  id: string;
  title: string;
  cover_image_url: string | null;
  draw_date: string;
  price_per_number: number;
  status: string;
  winner_number: number | null;
}

interface PublicOrganizerRow {
  id: string;
  slug: string | null;
  full_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  bio: string | null;
  website_url: string | null;
  location: string | null;
  instagram_url: string | null;
}

/**
 * Perfil público del organizador.
 *
 * El slug es legible (`juan-perez`) desde la migración 0035; si llega un UUID
 * (enlaces viejos) se resuelve por id. Solo lee la vista `public_organizers`,
 * nunca `profiles`: email, teléfono y datos del KYC no se tocan.
 */
export default async function OrganizerProfilePage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createClient();
  let rawSlug = (params.slug ?? "").trim();
  try {
    rawSlug = decodeURIComponent(rawSlug).trim();
  } catch {
    // Slug mal formado: se usa tal cual y termina en 404.
  }
  if (rawSlug.length < 2) notFound();

  // Primero por slug; si no aparece y tiene forma de UUID, por id (compatibilidad).
  let organizer: PublicOrganizerRow | null = null;

  const { data: bySlug } = await supabase
    .from("public_organizers")
    .select("id, slug, full_name, avatar_url, is_verified")
    .eq("slug", rawSlug)
    .maybeSingle();

  if (bySlug) {
    organizer = bySlug as PublicOrganizerRow;
  } else if (UUID_RE.test(rawSlug)) {
    const { data: byId } = await supabase
      .from("public_organizers")
      .select("id, slug, full_name, avatar_url, is_verified")
      .eq("id", rawSlug)
      .maybeSingle();
    organizer = (byId as PublicOrganizerRow | null) ?? null;
  }

  if (!organizer) notFound();

  const { data: raffles } = await supabase
    .from("raffles")
    .select(
      "id, title, cover_image_url, draw_date, price_per_number, status, winner_number",
    )
    .eq("created_by", organizer.id)
    .in("status", ["active", "drawn"])
    .order("draw_date", { ascending: false });

  const all = (raffles ?? []) as OrganizerRaffle[];
  const active = all.filter((raffle) => raffle.status === "active");
  const finished = all
    .filter((raffle) => raffle.status === "drawn")
    .slice(0, 9);

  const initial = (organizer.full_name || "O").charAt(0).toUpperCase();
  const instagramHref = organizer.instagram_url
    ? organizer.instagram_url.startsWith("http")
      ? organizer.instagram_url
      : `https://instagram.com/${organizer.instagram_url.replace(/^@/, "")}`
    : null;
  const websiteHref = organizer.website_url
    ? organizer.website_url.startsWith("http")
      ? organizer.website_url
      : `https://${organizer.website_url}`
    : null;

  const { data: reviewRows } = await supabase
    .from("public_reviews")
    .select(
      "id, organizer_id, raffle_id, user_name, rating, comment, reply, created_at",
    )
    .eq("organizer_id", organizer.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const reviews = (reviewRows ?? []) as PublicReview[];
  const average = averageRating(reviews);

  return (
    <div className="space-y-12">
      <header className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        {organizer.avatar_url ? (
          <Image
            src={organizer.avatar_url}
            alt={organizer.full_name || "Organizador"}
            width={88}
            height={88}
            className="h-20 w-20 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-2xl font-bold text-white">
            {initial}
          </div>
        )}

        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <h1 className="font-display text-3xl font-bold tracking-tight">
              {organizer.full_name || "Organizador"}
            </h1>
            {organizer.is_verified && (
              <BadgeCheck className="h-5 w-5 text-emerald-500" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {active.length} sorteo{active.length === 1 ? "" : "s"} activo
            {active.length === 1 ? "" : "s"}
            {finished.length > 0
              ? ` · ${finished.length} finalizado${finished.length === 1 ? "" : "s"}`
              : ""}
          </p>
          {reviews.length > 0 && (
            <p className="flex items-center justify-center gap-1.5 text-sm sm:justify-start">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="font-semibold">{formatRating(average)}</span>
              <span className="text-muted-foreground">
                ({reviews.length} reseña{reviews.length === 1 ? "" : "s"})
              </span>
            </p>
          )}
        </div>
      </header>

      {(organizer.bio ||
        organizer.location ||
        websiteHref ||
        instagramHref) && (
        <section className="space-y-3 rounded-xl border bg-card p-5 shadow-soft">
          {organizer.bio && (
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {organizer.bio}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {organizer.location && (
              <span className="text-muted-foreground">{organizer.location}</span>
            )}
            {websiteHref && (
              <a
                href={websiteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
              >
                Sitio web
              </a>
            )}
            {instagramHref && (
              <a
                href={instagramHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
              >
                Instagram
              </a>
            )}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Sorteos activos</h2>

        {active.length === 0 ? (
          <Card className="border-dashed text-center">
            <CardContent className="space-y-2 py-10">
              <Ticket className="mx-auto h-9 w-9 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Este organizador no tiene sorteos abiertos en este momento.
              </p>
              <Link href="/#sorteos" className={buttonVariants()}>
                Ver todos los sorteos
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((raffle) => (
              <Card key={raffle.id} className="flex flex-col overflow-hidden">
                <div className="relative aspect-video w-full bg-muted">
                  {raffle.cover_image_url ? (
                    <Image
                      src={raffle.cover_image_url}
                      alt={raffle.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl">
                      🎁
                    </div>
                  )}
                </div>

                <CardHeader className="space-y-1 pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg leading-tight">
                      {raffle.title}
                    </CardTitle>
                    <Badge variant="success">Activo</Badge>
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDateTime(raffle.draw_date)}
                  </p>
                </CardHeader>

                <CardContent className="mt-auto space-y-3">
                  <p className="text-sm font-semibold">
                    {formatPrice(Number(raffle.price_per_number))}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      por número
                    </span>
                  </p>
                  <Link
                    href={`/sorteos/${raffle.id}`}
                    className={buttonVariants({
                      size: "sm",
                      className: "w-full",
                    })}
                  >
                    Ver sorteo
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {finished.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Sorteos finalizados</h2>
          <div className="space-y-2">
            {finished.map((raffle) => (
              <Link
                key={raffle.id}
                href={`/sorteos/${raffle.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 transition hover:border-amber-400"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{raffle.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(raffle.draw_date)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-muted-foreground">
                    Ganador Nº{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {raffle.winner_number != null
                        ? formatNumber(raffle.winner_number)
                        : "—"}
                    </span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <ReviewSection
        reviews={reviews}
        organizerName={organizer.full_name ?? undefined}
      />
    </div>
  );
}
