import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { requireAdminSession } from "@/lib/auth";
import { parseLandingContent } from "@/lib/landing";
import { createClient } from "@/lib/supabase/server";
import { LandingEditor } from "@/components/admin/LandingEditor";

export const dynamic = "force-dynamic";

export default async function LandingBuilderPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await requireAdminSession();
  if (!session) redirect("/login");

  const supabase = createClient();

  const { data: raffle } = await supabase
    .from("raffles")
    .select("id, title, landing_content, status")
    .eq("id", params.id)
    .maybeSingle();

  if (!raffle) notFound();

  const { data: owns } = await supabase.rpc("owns_raffle", {
    p_raffle_id: params.id,
  });

  if (owns !== true) notFound();

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/sorteos/${params.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al sorteo
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Landing promocional
          </h1>
          <p className="text-sm text-muted-foreground">
            Contenido arriba del grid: texto, imágenes y videos de YouTube o
            Vimeo. Se guarda como bloques seguros, sin HTML.
          </p>
        </div>
        <Link
          href={`/sorteos/${params.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-amber-800 underline-offset-4 hover:underline dark:text-amber-300"
        >
          Ver página pública
          <ExternalLink className="h-4 w-4" />
        </Link>
      </header>

      <LandingEditor
        raffleId={raffle.id}
        raffleTitle={raffle.title}
        initialBlocks={parseLandingContent(raffle.landing_content)}
      />
    </div>
  );
}
