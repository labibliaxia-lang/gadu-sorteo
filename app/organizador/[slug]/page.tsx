import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarDays, Ticket } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime, formatPrice } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Organizador | Gadu Sorteos",
  description: "Perfil público del organizador y sus sorteos activos.",
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
}

/**
 * Perfil público del organizador.
 *
 * El slug es su UUID (v4, aleatorio: no se puede enumerar) y se valida contra
 * el formato. La página solo lee la vista `public_organizers` (nombre, avatar y
 * sello), nunca `profiles`: email, teléfono y datos del KYC no se tocan.
 */
export default async function OrganizerProfilePage({
  params,
}: {
  params: { slug: string };
}) {
  if (!UUID_RE.test(params.slug)) notFound();

  const supabase = createClient();

  const { data: organizer } = await supabase
    .from("public_organizers")
    .select("id, full_name, avatar_url, is_verified")
    .eq("id", params.slug)
    .maybeSingle();

  if (!organizer) notFound();

  const { data: raffles } = await supabase
    .from("raffles")
    .select("id, title, cover_image_url, draw_date, price_per_number, status")
    .eq("created_by", params.slug)
    .eq("status", "active")
    .order("draw_date", { ascending: true });

  const list = (raffles ?? []) as OrganizerRaffle[];
  const initial = (organizer.full_name || "O").charAt(0).toUpperCase();

  return (
    <div className="space-y-10">
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
            <h1 className="text-3xl font-bold tracking-tight">
              {organizer.full_name || "Organizador"}
            </h1>
            {organizer.is_verified && (
              <BadgeCheck className="h-5 w-5 text-emerald-500" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {list.length} sorteo{list.length === 1 ? "" : "s"} activo
            {list.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      {list.length === 0 ? (
        <Card className="mx-auto max-w-md border-dashed text-center">
          <CardContent className="space-y-2 py-12">
            <Ticket className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Sin sorteos activos</h2>
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
          {list.map((raffle) => (
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
    </div>
  );
}
