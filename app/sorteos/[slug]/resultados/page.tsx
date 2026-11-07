import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Trophy } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { resolverColumna } from "@/lib/raffle-slug";
import { ShareResultsButton } from "@/components/ShareResultsButton";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

interface Ganador {
  position: number;
  number: number;
  name: string | null;
  prizeTitle: string | null;
  imageUrl: string | null;
}

function nombreCorto(fullName: string | null): string {
  const partes = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "Participante";
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1][0]}.`;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const supabase = createClient();
  const { data: raffle } = await supabase
    .from("raffles")
    .select("title, status, winner_name, winner_number")
    .eq(resolverColumna(params.slug), params.slug)
    .maybeSingle();

  if (!raffle) return { title: "Resultados no encontrados | Gadu Sorteos" };

  const dibujado = raffle.status === "drawn" && raffle.winner_number != null;
  const titulo = dibujado
    ? `¡${nombreCorto(raffle.winner_name as string | null)} ganó ${raffle.title} en Gadu Sorteos!`
    : `Resultados de ${raffle.title} | Gadu Sorteos`;

  return {
    title: titulo,
    description: dibujado
      ? `Mirá el podio final y verificá el resultado del sorteo ${raffle.title}.`
      : `Resultados y podio del sorteo ${raffle.title}.`,
    openGraph: {
      title: titulo,
      description: "Podio final y resultado verificable.",
      images: [`/sorteos/${params.slug}/resultados/opengraph-image`],
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      images: [`/sorteos/${params.slug}/resultados/opengraph-image`],
    },
  };
}

export default async function ResultadosPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createClient();
  const parametro = params.slug.trim();

  let { data: raffle } = await supabase
    .from("raffles")
    .select("id, title, slug, status, winner_name, winner_number, cover_image_url")
    .eq(resolverColumna(parametro), parametro)
    .maybeSingle();

  if (!raffle) {
    const { data: porId } = await supabase
      .from("raffles")
      .select("id, title, slug, status, winner_name, winner_number, cover_image_url")
      .eq("id", parametro)
      .maybeSingle();
    raffle = porId;
  }

  if (!raffle) notFound();

  const [{ data: winnersData }, { data: prizesData }] = await Promise.all([
    supabase
      .from("raffle_winners")
      .select("position, number, user_name, prize_title")
      .eq("raffle_id", raffle.id)
      .order("position", { ascending: true }),
    supabase
      .from("prizes")
      .select("position, image_url")
      .eq("raffle_id", raffle.id),
  ]);

  const fotos = new Map<number, string | null>(
    (prizesData ?? []).map((p) => [
      Number(p.position),
      (p.image_url as string | null) ?? null,
    ]),
  );

  const ganadores: Ganador[] = (winnersData ?? []).map((fila) => ({
    position: Number(fila.position),
    number: Number(fila.number),
    name: (fila.user_name as string | null) ?? null,
    prizeTitle: (fila.prize_title as string | null) ?? null,
    imageUrl: fotos.get(Number(fila.position)) ?? null,
  }));

  // Compatibilidad con sorteos de un solo ganador (anteriores a 0058).
  if (ganadores.length === 0 && raffle.winner_number != null) {
    ganadores.push({
      position: 1,
      number: Number(raffle.winner_number),
      name: (raffle.winner_name as string | null) ?? null,
      prizeTitle: null,
      imageUrl: fotos.get(1) ?? null,
    });
  }

  const dibujado = raffle.status === "drawn" && ganadores.length > 0;
  const clavePublica = (raffle.slug as string | null) ?? raffle.id;
  const principal = ganadores[0];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        href={`/sorteos/${clavePublica}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al sorteo
      </Link>

      <header className="space-y-2 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand-accent">
          Resultados oficiales
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {raffle.title}
        </h1>
        <div className="flex justify-center">
          <Badge variant={dibujado ? "success" : "secondary"}>
            {dibujado ? "Sorteo finalizado" : "Todavía sin resultado"}
          </Badge>
        </div>
      </header>

      {!dibujado ? (
        <div className="rounded-xl border border-hairline bg-panel-1 p-8 text-center text-sm text-fg-subtle">
          El resultado todavía no está publicado. Volvé cuando se haya sorteado.
        </div>
      ) : (
        <>
          {principal.imageUrl && (
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-hairline bg-panel-2">
              <Image
                src={principal.imageUrl}
                alt={principal.prizeTitle ?? raffle.title}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 768px"
                priority
              />
            </div>
          )}

          <section className="space-y-3" aria-label="Podio de ganadores">
            {ganadores.map((ganador) => (
              <article
                key={ganador.position}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-hairline bg-panel-1 p-4"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-accent/15 font-mono text-lg font-bold text-brand-accent">
                  {ganador.position}
                </div>

                {ganador.imageUrl && (
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-hairline">
                    <Image
                      src={ganador.imageUrl}
                      alt={ganador.prizeTitle ?? `Premio ${ganador.position}`}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {ganador.name ? nombreCorto(ganador.name) : "Participante"}
                  </p>
                  <p className="text-sm text-fg-subtle">
                    {ganador.prizeTitle ?? `Premio ${ganador.position}`}
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-subtle">
                    Número
                  </p>
                  <p className="font-mono text-xl font-semibold tabular-nums text-brand-accent">
                    {String(ganador.number).padStart(4, "0")}
                  </p>
                </div>
              </article>
            ))}
          </section>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <ShareResultsButton
              titulo={raffle.title}
              ganador={principal.name ? nombreCorto(principal.name) : null}
            />
            <Link
              href={`/sorteos/${clavePublica}/verificar`}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <Trophy className="mr-2 h-5 w-5" />
              Verificar el sorteo
            </Link>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Los ganadores se calculan en la base con la semilla comprometida antes
            del sorteo. Se publica solo el nombre y la inicial del apellido.
          </p>
        </>
      )}
    </div>
  );
}
