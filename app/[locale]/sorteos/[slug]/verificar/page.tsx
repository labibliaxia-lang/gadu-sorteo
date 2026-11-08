import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, ShieldCheck, Trophy } from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { MultiPrizeVerifier } from "@/components/MultiPrizeVerifier";
import { WinnerCertificate } from "@/components/WinnerCertificate";
import { collectSoldNumbers } from "@/lib/raffle-numbers";
import { resolverColumna } from "@/lib/raffle-slug";
import { formatDateTime } from "@/lib/utils";
import type { Raffle, RaffleWinner } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Verificar");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export const dynamic = "force-dynamic";

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
  params: { slug: string };
}) {
  const t = await getTranslations("Verificar");
  const tc = await getTranslations("Common");
  const locale = await getLocale();
  const supabase = createClient();

  // 0115: la ruta acepta slug o UUID viejo. Sin esto, `/sorteos/<slug>/verificar`
  // respondía 404: la consulta iba contra `id` con el slug adentro.
  const parametro = params.slug.trim();
  const columna = resolverColumna(parametro);
  let { data: raffle } = await supabase
    .from("raffles")
    .select("*")
    .eq(columna, parametro)
    .maybeSingle();

  // Compatibilidad: un slug inexistente con forma de UUID no debe romper; si la
  // primera búsqueda no trae nada, se intenta por id igual que la página madre.
  if (!raffle && columna === "slug") {
    const { data: porId } = await supabase
      .from("raffles")
      .select("*")
      .eq("id", parametro)
      .maybeSingle();
    raffle = porId;
  }

  if (!raffle) notFound();

  // A partir de acá todo va por id: los números, los ganadores y la RPC no
  // aceptan slug.
  const raffleId = raffle.id;
  // Para los enlaces se conserva la forma pública (slug cuando existe).
  const clavePublica = raffle.slug ?? raffle.id;

  // Listado completo: PostgREST corta en 1000 filas por respuesta, así que se
  // pagina. Con la lista truncada el verificador recalcula el hash con menos
  // números y acusa un fraude que no existe.
  const soldNumbers = await collectSoldNumbers(async (from, to) => {
    const { data, error } = await supabase
      .from("raffle_numbers")
      .select("number")
      .eq("raffle_id", raffleId)
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
          .eq("raffle_id", raffleId)
          .order("position", { ascending: true })
      : { data: null };
  const winners = (winnerRows ?? []) as RaffleWinner[];

  const base = siteUrl();
  const localePrefix = locale === "es" ? "" : `/${locale}`;
  const verifyUrl = base
    ? `${base}${localePrefix}/sorteos/${clavePublica}/verificar`
    : `${localePrefix}/sorteos/${clavePublica}/verificar`;

  const drawn = raffle.status === "drawn" && raffle.winner_number != null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <LocaleLink
        href={`/sorteos/${clavePublica}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </LocaleLink>

      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow-gold">{t("eyebrow")}</p>
          <Badge variant={statusVariant[raffle.status as Raffle["status"]]}>
            {tc(`status.${raffle.status}`)}
          </Badge>
        </div>
        <div>
          <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-[-0.02em]">
            {raffle.title}
          </h1>
          <p className="text-[13px] text-fg-subtle">
            {drawn && raffle.drawn_at
              ? t("drawnAt", { date: formatDateTime(raffle.drawn_at, locale) })
              : t("notDrawn")}
          </p>
        </div>
      </header>

      {!drawn ? (
        <>
          <section className="space-y-3 rounded-lg border border-hairline bg-panel-1 p-6">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <ShieldCheck className="h-5 w-5 text-brand-accent" />
              {t("commitmentTitle")}
            </h2>
            {raffle.draw_commitment ? (
              <>
                <p className="text-[13px] text-fg-subtle">
                  {t("commitmentPublished")}
                </p>
                <code className="block break-all rounded-md border border-hairline bg-panel-2 p-3 font-mono text-xs">
                  {raffle.draw_commitment}
                </code>
              </>
            ) : (
              <p className="text-[13px] text-fg-subtle">
                {t("commitmentMissing")}
              </p>
            )}
            <LocaleLink
              href={`/sorteos/${clavePublica}/en-vivo`}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-accent underline-offset-4 hover:underline"
            >
              {t("goLive")}
            </LocaleLink>
          </section>

          <section className="overflow-hidden rounded-lg border border-hairline bg-panel-1">
            <div className="border-b border-hairline px-6 py-3">
              <h2 className="font-display text-lg font-semibold">
                {t("howVerify")}
              </h2>
            </div>
            <ol className="divide-y divide-hairline">
              {[
                { label: t("step1Label"), text: t("step1Text") },
                { label: t("step2Label"), text: t("step2Text") },
                { label: t("step3Label"), text: t("step3Text") },
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
              <Trophy className="h-5 w-5" /> {t("certifiedResult")}
            </p>
            <p className="mt-3 font-mono text-5xl font-medium tracking-tight text-brand-accent">
              {String(raffle.winner_number).padStart(4, "0")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("winner", {
                name: raffle.winner_name ?? t("anonymous"),
              })}
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold">
              {t("hashesTitle")}
            </h2>
            <div className="space-y-2 text-xs">
              <div>
                <p className="font-medium">{t("commitmentHashLabel")}</p>
                <code className="block break-all rounded-md border border-hairline bg-panel-2 p-3 font-mono">
                  {raffle.draw_commitment ?? "—"}
                </code>
              </div>
              <div>
                <p className="font-medium">{t("numbersHashLabel")}</p>
                <code className="block break-all rounded-md border border-hairline bg-panel-2 p-3 font-mono">
                  {raffle.numbers_hash ?? "—"}
                </code>
              </div>
              <div>
                <p className="font-medium">{t("resultHashLabel")}</p>
                <code className="block break-all rounded-md border border-hairline bg-panel-2 p-3 font-mono">
                  {raffle.result_hash ?? "—"}
                </code>
              </div>
              <div>
                <p className="font-medium">{t("seedLabel")}</p>
                <code className="block break-all rounded-md border border-hairline bg-panel-2 p-3 font-mono">
                  {raffle.draw_seed ?? "—"}
                </code>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold">
              {t("soldNumbersTitle", { count: soldNumbers.length })}
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
              {t("canonicalNote")}
            </p>
          </section>

          {winners.length > 1 && (
            <section className="space-y-3">
              <h2 className="font-display text-lg font-semibold">
                {t("resultsByPrize")}
              </h2>
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
                ? t("certificatesByPrize")
                : t("certificate")}
            </h2>
            <p className="text-[13px] text-fg-subtle">
              {t("certificateDesc")}
            </p>
            {winners.length > 1 ? (
              <div className="space-y-3">
                {winners.map((winner) => (
                  <WinnerCertificate
                    key={winner.position}
                    raffleTitle={raffle.title}
                    prizeLabel={
                      winner.position === 1
                        ? t("firstPrize")
                        : t("prizePosition", { position: winner.position })
                    }
                    winnerName={winner.user_name ?? t("anonymous")}
                    winnerNumber={winner.number}
                    drawnAt={
                      raffle.drawn_at ? formatDateTime(raffle.drawn_at, locale) : null
                    }
                    verificationHash={winner.winner_hash}
                    verifyUrl={verifyUrl}
                  />
                ))}
              </div>
            ) : (
              <WinnerCertificate
                raffleTitle={raffle.title}
                winnerName={raffle.winner_name ?? t("anonymous")}
                winnerNumber={raffle.winner_number}
                drawnAt={
                  raffle.drawn_at ? formatDateTime(raffle.drawn_at, locale) : null
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
        <LocaleLink
          href={`/sorteos/${clavePublica}`}
          className="text-[13px] font-medium text-brand-accent underline-offset-4 hover:underline"
        >
          {t("publicPage")}
        </LocaleLink>
        <LocaleLink
          href={`/sorteos/${clavePublica}/en-vivo`}
          className="text-[13px] font-medium text-brand-accent underline-offset-4 hover:underline"
        >
          {t("liveRoom")}
        </LocaleLink>
      </div>
    </div>
  );
}
