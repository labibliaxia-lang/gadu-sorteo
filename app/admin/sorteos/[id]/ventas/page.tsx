import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, Phone } from "lucide-react";

import { cargarVentas } from "./_datos";
import { buttonVariants } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Fecha corta y legible, sin depender de la zona del servidor. */
function fecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SorteoVentasPage({ params }: { params: { id: string } }) {
  const resultado = await cargarVentas(params.id);

  if (!resultado.ok) {
    if (resultado.motivo === "sin-sesion") redirect("/login");
    if (resultado.motivo === "sin-permiso") redirect("/admin/sorteos");
    notFound();
  }

  const { sorteo, filas, resumen } = resultado;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <Link
            href={`/admin/sorteos/${sorteo.id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Volver al sorteo
          </Link>
          <h2 className="text-xl font-semibold">Ventas · {sorteo.title}</h2>
          <p className="text-sm text-muted-foreground">
            Quién compró qué. {formatPrice(sorteo.precio)} por número.
          </p>
        </div>

        {filas.length > 0 && (
          <a
            href={`/admin/sorteos/${sorteo.id}/ventas/export`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download className="mr-1.5 h-4 w-4" /> Descargar CSV
          </a>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Números vendidos</p>
          <p className="mt-1 text-2xl font-semibold">{resumen.numeros.toLocaleString("es-AR")}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Compradores</p>
          <p className="mt-1 text-2xl font-semibold">{resumen.compradores.toLocaleString("es-AR")}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total vendido</p>
          <p className="mt-1 text-2xl font-semibold">{formatPrice(resumen.total)}</p>
          <p className="text-xs text-muted-foreground">Calculado con el precio actual</p>
        </div>
      </div>

      {resumen.anonimos > 0 && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
          <strong>{resumen.anonimos}</strong> número(s) figuran vendidos sin comprador
          registrado. Pasa cuando se marcan a mano desde «Gestionar números» sin una reserva
          previa. Aparecen abajo como «{filas.find((f) => f.compradorId === null)?.nombre}».
        </p>
      )}

      {filas.length === 0 ? (
        <div className="rounded-xl border bg-muted/30 p-8 text-center">
          <p className="font-medium">Todavía no hay ventas.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cuando el organizador confirme un pago, el comprador aparece acá con sus números.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Comprador</th>
                <th className="px-3 py-2 font-medium">Teléfono</th>
                <th className="px-3 py-2 font-medium text-right">Números</th>
                <th className="px-3 py-2 font-medium">Cuáles</th>
                <th className="px-3 py-2 font-medium text-right">Total</th>
                <th className="px-3 py-2 font-medium">Última venta</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.compradorId ?? "anonimo"} className="border-t align-top">
                  <td className="px-3 py-2 font-medium">{fila.nombre}</td>
                  <td className="px-3 py-2">
                    {fila.telefono ? (
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                        <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                        {fila.telefono}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fila.cantidad}</td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {fila.numeros.slice(0, 18).join(", ")}
                      {fila.numeros.length > 18 && ` … +${fila.numeros.length - 18}`}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPrice(fila.total)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fecha(fila.ultimaVenta)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/30">
              <tr className="border-t">
                <td className="px-3 py-2 font-medium" colSpan={2}>
                  {filas.length} fila(s)
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{resumen.numeros}</td>
                <td />
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {formatPrice(resumen.total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        La planilla muestra nombre y teléfono, no email ni DNI: es lo que hace falta para
        validar una transferencia, y es todo lo que expone la vista de compradores.
      </p>
    </div>
  );
}
