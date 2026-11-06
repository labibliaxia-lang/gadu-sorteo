import { NextResponse } from "next/server";

import { cargarVentas } from "../_datos";
import { csvDeVentas } from "@/lib/ventas";

export const dynamic = "force-dynamic";

/**
 * Descarga de la planilla de ventas en CSV.
 *
 * Usa la misma carga que la página, así que hereda el control de permisos:
 * si alguien no puede ver la planilla, tampoco puede descargarla.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const resultado = await cargarVentas(params.id);

  if (!resultado.ok) {
    const status =
      resultado.motivo === "sin-sesion" ? 401 : resultado.motivo === "sin-permiso" ? 403 : 404;
    return NextResponse.json({ error: resultado.motivo }, { status });
  }

  const csv = csvDeVentas(resultado.filas, resultado.sorteo.title);

  const nombreArchivo = `ventas-${resultado.sorteo.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 40) || "sorteo"}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
