import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, Trophy } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { MultiPrizeVerifier } from "@/components/MultiPrizeVerifier";
import { WinnerCertificate } from "@/components/WinnerCertificate";
import { formatDateTime } from "@/lib/utils";
import type { Raffle, RaffleWinner } from "@/lib/types";

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
  cancelled: "Cancelado",
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

  const { data: winnerRows } =
    raffle.status === "drawn"
      ? await supabase
          .from("raffle_winners")
          .select("position, number, user_name, prize_title, winner_hash")
          .eq("raffle_id", params.id)
          .order("position", { ascending: true })
      : { data: null };
  const winners = (winnerRows ?? []) as RaffleWinner[];

  const base = siteUrl();
  const verifyUrl = base
    ? `${base}/sorteos/${params.id}/verificar`
    : `/sorteos/${params.id}/verificar`;

  const drawn = raffle.status === "drawn" && raffle.winner_number != null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        href={`/sorteos/${params.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al sorteo
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow-gold">
            Verificación pública
          </p>
          <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-[-0.02em]">
            {raffle.title}
          </h1>
          <p className="text-[13px] text-fg-subtle">
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
        <section className="space-y-3 rounded-lg border border-hairline bg-panel-1 p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <ShieldCheck className="h-5 w-5 text-brand-accent" />
            Compromiso del sorteo
          </h2>
          {raffle.draw_commitment ? (
            <>
              <p className="text-[13px] text-fg-subtle">
                El organizador ya publicó el compromiso (hash de la semilla).
                Cuando se sortee vas a poder comparar el resultado acá.
              </p>
              <code className="block break-all rounded-md border border-hairline bg-panel-2 p-3 font-mono text-xs">
                {raffle.draw_commitment}
              </code>
            </>
          ) : (
            <p className="text-[13px] text-fg-subtle">
              Este sorteo todavía no publicó el compromiso de la semilla. Cuando lo haga, vas a poder compararlo acá antes del sorteo.
            </p>
          )}
          <Link
            href={`/sorteos/${params.id}/en-vivo`}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-accent underline-offset-4 hover:underline"
          >
            Ir a la sala en vivo
          </Link>
        </section>
      ) : (
        <>
          <section className="rounded-lg border border-brand-500/25 bg-brand-500/[0.06] p-6">
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-brand-accent">
              <Trophy className="h-5 w-5" /> Resultado certificado
            </p>
            <p className="mt-3 font-mono text-5xl font-medium tracking-tight text-brand-accent">
              {String(raffle.winner_number).padStart(4, "0")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ganador: {raffle.winner_name ?? "Anónimo"}
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold">Huellas del sorteo</h2>
            <div className="space-y-2 text-xs">
              <div>
                <p className="font-medium">Compromiso publicado antes de sortear</p>
                <code className="block break-all rounded-md border border-hairline bg-panel-2 p-3 font-mono">
                  {raffle.draw_commitment ?? "—"}
                </code>
              </div>
              <div>
                <p className="font-medium">
                  Huella del listado vendido (<code>numbers_hash</code>)
                </p>
                <code className="block break-all rounded-md border border-hairline bg-panel-2 p-3 font-mono">
                  {raffle.numbers_hash ?? "—"}
                </code>
              </div>
              <div>
                <p className="font-medium">
                  Huella del resultado (<code>result_hash</code>)
                </p>
                <code className="block break-all rounded-md border border-hairline bg-panel-2 p-3 font-mono">
                  {raffle.result_hash ?? "—"}
                </code>
              </div>
              <div>
                <p className="font-medium">Semilla revelada</p>
                <code className="block break-all rounded-md border border-hairline bg-panel-2 p-3 font-mono">
                  {raffle.draw_seed ?? "—"}
                </code>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold">
              Números vendidos que participaron ({soldNumbers.length})
            </h2>
            <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-hairline bg-panel-1/60 p-3">
              {soldNumbers.map((number) => (
                <span
                  key={number}
                  className={
                    winners.some((winner) => winner.number === number) ||
                    number === raffle.winner_number
                      ? "rounded-md bg-brand-500 px-2 py-0.5 font-mono text-xs font-semibold text-ink"
                      : "rounded-md bg-panel-2 px-2 py-0.5 font-mono text-xs text-fg-subtle"
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

          {winners.length > 1 && (
            <section className="space-y-3">
              <h2 className="font-display text-lg font-semibold">Resultados por premio</h2>
              <MultiPrizeVerifier
                raffleId={raffle.id}
                seed={raffle.draw_seed ?? ""}
                commitment={raffle.draw_commitment ?? ""}
                numbers={soldNumbers}
                numbersHash={raffle.numbers_hash ?? ""}
                winners={winners.map((winner) => ({
                  position: winner.position,
                  number: winner.number,
                  hash: winner.winner_hash,
                }))}
                resultsHash={raffle.results_hash ?? ""}
              />
            </section>
          )}

          <section className="space-y-3 rounded-lg border border-hairline bg-panel-1 p-5">
            <h2 className="font-display text-lg font-semibold">
              {winners.length > 1
                ? "Certificados por premio"
                : "Certificado de ganador"}
            </h2>
            <p className="text-[13px] text-fg-subtle">
              Descargá el certificado con el número, el ganador y el hash de
              verificación.
            </p>
            {winners.length > 1 ? (
              <div className="space-y-3">
                {winners.map((winner) => (
                  <WinnerCertificate
                    key={winner.position}
                    raffleTitle={raffle.title}
                    prizeLabel={
                      winner.position === 1
                        ? "1.er premio"
                        : `${winner.position}º premio`
                    }
                    winnerName={winner.user_name ?? "Anónimo"}
                    winnerNumber={winner.number}
                    drawnAt={
                      raffle.drawn_at ? formatDateTime(raffle.drawn_at) : null
                    }
                    verificationHash={winner.winner_hash}
                    verifyUrl={verifyUrl}
                  />
                ))}
              </div>
            ) : (
              <WinnerCertificate
                raffleTitle={raffle.title}
                winnerName={raffle.winner_name ?? "Anónimo"}
                winnerNumber={raffle.winner_number}
                drawnAt={
                  raffle.drawn_at ? formatDateTime(raffle.drawn_at) : null
                }
                verificationHash={
                  raffle.result_hash ?? raffle.draw_commitment ?? ""
                }
                verifyUrl={verifyUrl}
              />
            )}
          </section>
        </>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href={`/sorteos/${params.id}`}
          className="text-[13px] font-medium text-brand-accent underline-offset-4 hover:underline"
        >
          Página pública del sorteo
        </Link>
        <Link
          href={`/sorteos/${params.id}/en-vivo`}
          className="text-[13px] font-medium text-brand-accent underline-offset-4 hover:underline"
        >
          Sala en vivo
        </Link>
      </div>
    </div>
  );
}
