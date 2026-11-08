import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Radio } from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { LiveDrawAnimation } from "@/components/LiveDrawAnimation";
import { resolverColumna } from "@/lib/raffle-slug";
import { formatDateTime } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("EnVivo");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export const dynamic = "force-dynamic";

export default async function LiveDrawPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { demo?: string };
}) {
  const t = await getTranslations("EnVivo");
  const tc = await getTranslations("Common");
  const locale = await getLocale();
  const supabase = createClient();

  // 0115: la ruta acepta slug o UUID viejo. Sin esto, `/sorteos/<slug>/en-vivo`
  // respondía 404 porque buscaba el slug en la columna `id`.
  const parametro = params.slug.trim();
  if (!parametro) notFound();

  const columna = resolverColumna(parametro);
  let { data: raffle, error: raffleError } = await supabase
    .from("raffles")
    .select("*")
    .eq(columna, parametro)
    .maybeSingle();

  if (!raffle && columna === "slug") {
    const { data: porId, error: porIdError } = await supabase
      .from("raffles")
      .select("*")
      .eq("id", parametro)
      .maybeSingle();
    raffle = porId;
    raffleError = porIdError;
  }

  // No hay sorteo: 404, no una sala en vivo vacía. Si además hubo un error de
  // lectura, es una falla real y tiene que verse, no confundirse con un 404.
  if (!raffle) {
    if (raffleError) {
      throw new Error(
        `No se pudo cargar el sorteo en vivo: ${raffleError.message}`,
      );
    }
    notFound();
  }

  // La sala sólo tiene sentido para un sorteo que se puede sortear o que ya
  // se sorteó. Un sorteo cancelado o pausado no va a producir un resultado:
  // 404 en vez de una animación que nunca arranca.
  if (!["active", "closed", "drawn"].includes(raffle.status)) notFound();

  // De acá para abajo todo va por id; los enlaces conservan la forma pública.
  const raffleId = raffle.id;
  const clavePublica = raffle.slug ?? raffle.id;

  const [soldResult, soldCountResult] = await Promise.all([
    supabase
      .from("raffle_numbers")
      .select("number")
      .eq("raffle_id", raffleId)
      .eq("status", "sold")
      .order("number")
      .limit(300),
    supabase
      .from("raffle_numbers")
      .select("*", { count: "exact", head: true })
      .eq("raffle_id", raffleId)
      .eq("status", "sold"),
  ]);

  const sampleNumbers = ((soldResult.data ?? []) as { number: number }[]).map(
    (row) => row.number,
  );
  const soldCount = soldCountResult.count ?? sampleNumbers.length;

  // 0058: ganadores definitivos (multipremio). Público por RLS.
  const { data: winnersData } = await supabase
    .from("raffle_winners")
    .select("position, number, user_name, prize_title")
    .eq("raffle_id", raffleId)
    .order("position", { ascending: true });

  const initialWinners = (winnersData ?? []).map((fila) => ({
    position: Number(fila.position),
    number: Number(fila.number),
    name: (fila.user_name as string | null) ?? null,
    prizeTitle: (fila.prize_title as string | null) ?? null,
  }));

  // Solo desarrollo: ?demo=1 muestra la animación con 3 premios ficticios.
  const demo =
    process.env.NODE_ENV !== "production" && searchParams?.demo === "1";
  const demoWinners = demo
    ? [
        { position: 1, number: 11, name: "Juan Pérez", prizeTitle: "1º premio" },
        { position: 2, number: 42, name: "María Gómez", prizeTitle: "2º premio" },
        { position: 3, number: 7, name: "Luis Díaz", prizeTitle: "3º premio" },
      ]
    : [];

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let canDraw = false;

  if (user) {
    const [{ data: profile }, { data: owns }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabase.rpc("owns_raffle", { p_raffle_id: raffleId }),
    ]);

    canDraw =
      (profile?.role === "admin" || profile?.role === "superadmin") &&
      owns === true;
  }

  return (
    <div className="space-y-6">
      <LocaleLink
        href={`/sorteos/${clavePublica}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </LocaleLink>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-brand-800 dark:text-brand-300">
            <Radio className="h-4 w-4" /> {t("liveRoom")}
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {raffle.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {raffle.status === "drawn"
              ? t("finished")
              : t("scheduled", {
                  date: formatDateTime(raffle.draw_date, locale),
                })}
          </p>
        </div>
        <Badge variant="secondary">{tc(`status.${raffle.status}`)}</Badge>
      </header>

      <LiveDrawAnimation
        raffleId={raffle.id}
        initialStatus={demo ? "active" : raffle.status}
        initialWinner={demo ? null : (raffle.winner_number ?? null)}
        initialWinners={demo ? [] : initialWinners}
        demoWinners={demoWinners}
        soldCount={soldCount}
        canDraw={demo ? false : canDraw}
        hasCommitment={Boolean(raffle.draw_commitment)}
        sampleNumbers={sampleNumbers}
      />

      <div className="flex flex-wrap gap-2 text-sm">
        <LocaleLink
          href={`/sorteos/${clavePublica}`}
          className="text-brand-800 underline-offset-4 hover:underline dark:text-brand-300"
        >
          {t("seeRaffle")}
        </LocaleLink>
        <LocaleLink
          href={`/sorteos/${clavePublica}/verificar`}
          className="text-brand-800 underline-offset-4 hover:underline dark:text-brand-300"
        >
          {t("verifyPage")}
        </LocaleLink>
      </div>
    </div>
  );
}
