import { ImageResponse } from "next/og";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolverColumna } from "@/lib/raffle-slug";

export const runtime = "edge";
export const alt = "Resultado del sorteo en Gadu Sorteos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function nombreCorto(fullName: string | null): string {
  const partes = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "un participante";
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1][0]}.`;
}

/**
 * OpenGraph dinámico para sorteos terminados: tarjeta con el ganador y el
 * premio. Usa el nombre recortado (sin apellido completo) y no expone datos
 * de contacto. Si el sorteo todavía no se sorteó, cae a la portada.
 */
export default async function OpengraphImage({
  params,
}: {
  params: { slug: string };
}) {
  const admin = createAdminClient();
  const { data: raffle } = await admin
    .from("raffles")
    .select("title, cover_image_url, status, winner_name, winner_number")
    .eq(resolverColumna(params.slug), params.slug)
    .maybeSingle();

  const dibujado =
    raffle?.status === "drawn" && raffle?.winner_number != null;

  if (!dibujado) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            background: "linear-gradient(135deg, #0b0f19 0%, #1b2436 100%)",
            color: "#f8fafc",
            padding: 60,
            textAlign: "center",
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ fontSize: 34, letterSpacing: 6, opacity: 0.7 }}>
            GADU SORTEOS
          </div>
          <div style={{ fontSize: 64, fontWeight: 700, marginTop: 24 }}>
            {raffle?.title ?? "Sorteo verificable"}
          </div>
          <div style={{ fontSize: 30, marginTop: 20, opacity: 0.8 }}>
            Resultado verificable · hash público
          </div>
        </div>
      ),
      size,
    );
  }

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
            RESULTADO OFICIAL
          </div>
        </div>

        <div
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div style={{ fontSize: 34, opacity: 0.75 }}>¡Tenemos ganador!</div>
          <div style={{ fontSize: 88, fontWeight: 800, lineHeight: 1.05 }}>
            {nombreCorto(raffle?.winner_name ?? null)}
          </div>
          <div style={{ fontSize: 36, opacity: 0.9 }}>
            ganó «{raffle?.title}» con el número {raffle?.winner_number}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontSize: 26, opacity: 0.7 }}>
            Resultado verificable · hash público
          </div>
          <div style={{ fontSize: 26, opacity: 0.7 }}>gadu sorteos</div>
        </div>
      </div>
    ),
    size,
  );
}
