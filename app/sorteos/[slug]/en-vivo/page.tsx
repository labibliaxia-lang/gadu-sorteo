import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Radio } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { LiveDrawAnimation } from "@/components/LiveDrawAnimation";
import { resolverColumna } from "@/lib/raffle-slug";
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
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { demo?: string };
}) {
  const supabase = createClient();

  // 0115: la ruta acepta slug o UUID viejo. Sin esto, `/sorteos/<slug>/en-vivo`
  // respondía 404 porque buscaba el slug en la columna `id`.
  const parametro = params.slug.trim();
  const columna = resolverColumna(parametro);
  let { data: raffle } = await supabase
    .from("raffles")
    .select("*")
    .eq(columna, parametro)
    .maybeSingle();

  if (!raffle && columna === "slug") {
    const { data: porId } = await supabase
      .from("raffles")
      .select("*")
      .eq("id", parametro)
      .maybeSingle();
    raffle = porId;
  }

  if (!raffle) notFound();

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
      <Link
        href={`/sorteos/${clavePublica}`}
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
        <Link
          href={`/sorteos/${clavePublica}`}
          className="text-brand-800 underline-offset-4 hover:underline dark:text-brand-300"
        >
          Ver el sorteo
        </Link>
        <Link
          href={`/sorteos/${clavePublica}/verificar`}
          className="text-brand-800 underline-offset-4 hover:underline dark:text-brand-300"
        >
          Página de verificación
        </Link>
      </div>
    </div>
  );
}
