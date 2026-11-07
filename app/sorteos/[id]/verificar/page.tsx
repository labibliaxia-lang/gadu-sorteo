import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, Trophy } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { MultiPrizeVerifier } from "@/components/MultiPrizeVerifier";
import { WinnerCertificate } from "@/components/WinnerCertificate";
import { collectSoldNumbers } from "@/lib/raffle-numbers";
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
  paused: "Pausado",
};

const statusVariant: Record<
  Raffle["status"],
  "success" | "warning" | "secondary"
> = {
  active: "success",
  closed: "warning",
  drawn: "secondary",
  cancelled: "secondary",
  paused: "warning",
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

  // Listado completo: PostgREST corta en 1000 filas por respuesta, así que se
  // pagina. Con la lista truncada el verificador recalcula el hash con menos
  // números y acusa un fraude que no existe.
  const soldNumbers = await collectSoldNumbers(async (from, to) => {
    const { data, error } = await supabase
      .from("raffle_numbers")
      .select("number")
      .eq("raffle_id", params.id)
      .eq("status", "sold")
      .order("number", { ascending: true })
      .range(from, to);

    return { data: (data as { number: number }[] | null) ?? null, error };
  });

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

      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow-gold">Verificación pública</p>
          <Badge variant={statusVariant[raffle.status as Raffle["status"]]}>
            {statusLabel[raffle.status as Raffle["status"]]}
          </Badge>
        </div>
        <div>
          <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-[-0.02em]">
            {raffle.title}
          </h1>
          <p className="text-[13px] text-fg-subtle">
            {drawn && raffle.drawn_at
              ? `Sorteado: ${formatDateTime(raffle.drawn_at)}`
              : "Todavía no se realizó el sorteo."}
          </p>
        </div>
      </header>

      {!drawn ? (
        <>
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

          <section className="overflow-hidden rounded-lg border border-hairline bg-panel-1">
            <div className="border-b border-hairline px-6 py-3">
              <h2 className="font-display text-lg font-semibold">
                Cómo se verifica
              </h2>
            </div>
            <ol className="divide-y divide-hairline">
              {[
                {
                  label: "Compromiso",
                  text: "antes del sorteo el organizador publica el hash SHA-256 de una semilla secreta. Si la cambiara después, el hash no coincidiría.",
                },
                {
                  label: "Semilla",
                  text: "al sortear se revela la semilla. Cualquiera puede recalcular el hash y comprobar que es la misma que se publicó antes.",
                },
                {
                  label: "Listado",
                  text: "el listado de números vendidos también se hashea. Si se agregara o quitara un número, la huella del resultado no coincidiría.",
                },
              ].map((step, index) => (
                <li key={step.label} className="flex gap-3 px-6 py-3">
                  <span className="font-mono text-[11px] leading-5 text-fg-subtle">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="text-[13px] leading-5 text-fg-muted">
                    <span className="font-medium text-fg">{step.label}</span>{" "}
                    {step.text}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </>
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
