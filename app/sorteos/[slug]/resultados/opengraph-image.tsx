import { ImageResponse } from "next/og";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolverColumna } from "@/lib/raffle-slug";

export const runtime = "edge";
export const alt = "Resultados oficiales del sorteo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function nombreCorto(fullName: string | null): string {
  const partes = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "un participante";
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1][0]}.`;
}

export default async function OpengraphImage({
  params,
}: {
  params: { slug: string };
}) {
  const admin = createAdminClient();
  const { data: raffle } = await admin
    .from("raffles")
    .select("id, title, status, winner_name, winner_number")
    .eq(resolverColumna(params.slug), params.slug)
    .maybeSingle();

  const { data: winners } = raffle
    ? await admin
        .from("raffle_winners")
        .select("position, number, user_name, prize_title")
        .eq("raffle_id", raffle.id)
        .order("position", { ascending: true })
    : { data: null };

  const principal =
    winners && winners.length > 0
      ? {
          nombre: (winners[0].user_name as string | null) ?? null,
          premio: (winners[0].prize_title as string | null) ?? null,
          numero: Number(winners[0].number),
        }
      : raffle?.winner_number != null
        ? {
            nombre: (raffle.winner_name as string | null) ?? null,
            premio: null,
            numero: Number(raffle.winner_number),
          }
        : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0b0f19 0%, #2a1a05 100%)",
          color: "#f8fafc",
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontSize: 30, letterSpacing: 5, opacity: 0.7 }}>
            GADU SORTEOS
          </div>
          <div
            style={{
              fontSize: 26,
              background: "#f59e0b",
              color: "#0b0f19",
              padding: "8px 20px",
              borderRadius: 999,
              fontWeight: 700,
            }}
          >
            RESULTADOS OFICIALES
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div style={{ display: "flex", fontSize: 32, opacity: 0.75 }}>
            {principal ? "¡Tenemos ganador!" : (raffle?.title ?? "Resultados")}
          </div>
          {principal && (
            <div
              style={{
                display: "flex",
                fontSize: 72,
                fontWeight: 800,
                lineHeight: 1.05,
              }}
            >
              {nombreCorto(principal.nombre)}
            </div>
          )}
          <div style={{ display: "flex", fontSize: 32, opacity: 0.9 }}>
            {principal
              ? `ganó «${principal.premio ?? raffle?.title}» con el número ${principal.numero}`
              : "Resultado verificable"}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontSize: 26, opacity: 0.7 }}>
            Podio final · resultado verificable
          </div>
          <div style={{ fontSize: 26, opacity: 0.7 }}>gadu sorteos</div>
        </div>
      </div>
    ),
    size,
  );
}
