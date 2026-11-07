import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Radio } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { LiveDrawAnimation } from "@/components/LiveDrawAnimation";
import { formatDateTime } from "@/lib/utils";
import type { Raffle } from "@/lib/types";

export const metadata: Metadata = {
  title: "Sorteo en vivo | Gadu Sorteos",
  description: "Seguí el sorteo en vivo y verificá el resultado.",
};

export const dynamic = "force-dynamic";

const statusLabel: Record<Raffle["status"], string> = {
  active: "Activo",
  closed: "Cerrado",
  drawn: "Sorteado",
  cancelled: "Cancelado",
  paused: "Pausado",
};

export default async function LiveDrawPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createClient();

  const { data: raffle } = await supabase
    .from("raffles")
    .select("*")
    .eq("id", params.slug)
    .maybeSingle();

  if (!raffle) notFound();

  const [soldResult, soldCountResult] = await Promise.all([
    supabase
      .from("raffle_numbers")
      .select("number")
      .eq("raffle_id", params.slug)
      .eq("status", "sold")
      .order("number")
      .limit(300),
    supabase
      .from("raffle_numbers")
      .select("*", { count: "exact", head: true })
      .eq("raffle_id", params.slug)
      .eq("status", "sold"),
  ]);

  const sampleNumbers = ((soldResult.data ?? []) as { number: number }[]).map(
    (row) => row.number,
  );
  const soldCount = soldCountResult.count ?? sampleNumbers.length;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let canDraw = false;

  if (user) {
    const [{ data: profile }, { data: owns }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabase.rpc("owns_raffle", { p_raffle_id: params.slug }),
    ]);

    canDraw =
      (profile?.role === "admin" || profile?.role === "superadmin") &&
      owns === true;
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/sorteos/${params.slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al sorteo
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-brand-800 dark:text-brand-300">
            <Radio className="h-4 w-4" /> Sala en vivo
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {raffle.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {raffle.status === "drawn"
              ? "Sorteo finalizado"
              : `Fecha programada: ${formatDateTime(raffle.draw_date)}`}
          </p>
        </div>
        <Badge variant="secondary">
          {statusLabel[raffle.status as Raffle["status"]]}
        </Badge>
      </header>

      <LiveDrawAnimation
        raffleId={raffle.id}
        initialStatus={raffle.status}
        initialWinner={raffle.winner_number ?? null}
        soldCount={soldCount}
        canDraw={canDraw}
        hasCommitment={Boolean(raffle.draw_commitment)}
        sampleNumbers={sampleNumbers}
      />

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href={`/sorteos/${params.slug}`}
          className="text-brand-800 underline-offset-4 hover:underline dark:text-brand-300"
        >
          Ver el sorteo
        </Link>
        <Link
          href={`/sorteos/${params.slug}/verificar`}
          className="text-brand-800 underline-offset-4 hover:underline dark:text-brand-300"
        >
          Página de verificación
        </Link>
      </div>
    </div>
  );
}
