import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, Trophy } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { WinnerCertificate } from "@/components/WinnerCertificate";
import { formatDateTime } from "@/lib/utils";
import type { Raffle } from "@/lib/types";

export const metadata: Metadata = {
  title: "Verificación del sorteo | Gadu Sorteos",
  description:
    "Hash, números vendidos y ganador para verificar el resultado del sorteo.",
};

export const dynamic = "force-dynamic";

const statusLabel: Record<Raffle["status"], string> = {
  active: "Activo",
  closed: "Cerrado",
  drawn: "Sorteado",
};

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
}

export default async function VerifyPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: raffle } = await supabase
    .from("raffles")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!raffle) notFound();

  const { data: soldData } = await supabase
    .from("raffle_numbers")
    .select("number")
    .eq("raffle_id", params.id)
    .eq("status", "sold")
    .order("number")
    .limit(5000);

  const soldNumbers = ((soldData ?? []) as { number: number }[]).map(
    (row) => row.number,
  );

  const base = siteUrl();
  const verifyUrl = base
    ? `${base}/sorteos/${params.id}/verificar`
    : `/sorteos/${params.id}/verificar`;

  const drawn = raffle.status === "drawn" && raffle.winner_number != null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={`/sorteos/${params.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al sorteo
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
            Verificación pública
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{raffle.title}</h1>
          <p className="text-sm text-muted-foreground">
            {drawn && raffle.drawn_at
              ? `Sorteado: ${formatDateTime(raffle.drawn_at)}`
              : "Todavía no se realizó el sorteo."}
          </p>
        </div>
        <Badge variant="secondary">
          {statusLabel[raffle.status as Raffle["status"]]}
        </Badge>
      </header>

      {!drawn ? (
        <section className="space-y-3 rounded-xl border bg-muted/30 p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="h-5 w-5 text-amber-500" />
            Compromiso publicado
          </h2>
          {raffle.draw_commitment ? (
            <>
              <p className="text-sm text-muted-foreground">
                El organizador ya publicó el compromiso (hash de la semilla).
                Cuando se sortee vas a poder comparar el resultado acá.
              </p>
              <code className="block break-all rounded-md bg-muted/60 p-3 font-mono text-xs">
                {raffle.draw_commitment}
              </code>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Todavía no hay compromiso publicado para este sorteo.
            </p>
          )}
          <Link
            href={`/sorteos/${params.id}/en-vivo`}
            className="text-sm text-amber-700 underline-offset-4 hover:underline dark:text-amber-400"
          >
            Ir a la sala en vivo
          </Link>
        </section>
      ) : (
        <>
          <section className="rounded-xl border bg-gradient-to-br from-amber-50 to-orange-50 p-6 dark:from-amber-950/30 dark:to-orange-950/20">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
              <Trophy className="h-5 w-5" /> Resultado certificado
            </p>
            <p className="mt-2 font-mono text-5xl font-black text-amber-800 dark:text-amber-200">
              {String(raffle.winner_number).padStart(4, "0")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ganador: {raffle.winner_name ?? "Anónimo"}
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Huellas del sorteo</h2>
            <div className="space-y-2 text-xs">
              <div>
                <p className="font-medium">Compromiso publicado antes de sortear</p>
                <code className="block break-all rounded-md bg-muted/60 p-3 font-mono">
                  {raffle.draw_commitment ?? "—"}
                </code>
              </div>
              <div>
                <p className="font-medium">
                  Huella del listado vendido (<code>numbers_hash</code>)
                </p>
                <code className="block break-all rounded-md bg-muted/60 p-3 font-mono">
                  {raffle.numbers_hash ?? "—"}
                </code>
              </div>
              <div>
                <p className="font-medium">
                  Huella del resultado (<code>result_hash</code>)
                </p>
                <code className="block break-all rounded-md bg-muted/60 p-3 font-mono">
                  {raffle.result_hash ?? "—"}
                </code>
              </div>
              <div>
                <p className="font-medium">Semilla revelada</p>
                <code className="block break-all rounded-md bg-muted/60 p-3 font-mono">
                  {raffle.draw_seed ?? "—"}
                </code>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">
              Números vendidos que participaron ({soldNumbers.length})
            </h2>
            <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto rounded-lg border bg-muted/20 p-3">
              {soldNumbers.map((number) => (
                <span
                  key={number}
                  className={
                    number === raffle.winner_number
                      ? "rounded-md bg-amber-500 px-2 py-0.5 font-mono text-xs font-bold text-white"
                      : "rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground"
                  }
                >
                  {number}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Listado canónico usado por el motor: ascendente y separado por
              comas. Si faltara un número, el hash no coincidiría.
            </p>
          </section>

          <section className="space-y-3 rounded-xl border p-5">
            <h2 className="text-lg font-semibold">Certificado de ganador</h2>
            <p className="text-sm text-muted-foreground">
              Descargá el certificado con el número, el ganador y el hash de
              verificación.
            </p>
            <WinnerCertificate
              raffleTitle={raffle.title}
              winnerName={raffle.winner_name ?? "Anónimo"}
              winnerNumber={raffle.winner_number}
              drawnAt={raffle.drawn_at ? formatDateTime(raffle.drawn_at) : null}
              verificationHash={raffle.result_hash ?? raffle.draw_commitment ?? ""}
              verifyUrl={verifyUrl}
            />
          </section>
        </>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href={`/sorteos/${params.id}`}
          className="text-amber-700 underline-offset-4 hover:underline dark:text-amber-400"
        >
          Página pública del sorteo
        </Link>
        <Link
          href={`/sorteos/${params.id}/en-vivo`}
          className="text-amber-700 underline-offset-4 hover:underline dark:text-amber-400"
        >
          Sala en vivo
        </Link>
      </div>
    </div>
  );
}
