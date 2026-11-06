import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, Phone } from "lucide-react";

import { cargarVentas } from "./_datos";
import { VentasAcciones } from "@/components/admin/VentasAcciones";
import { Button, buttonVariants } from "@/components/ui/button";
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
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

const ESTADO_LABEL: Record<string, string> = {
  pagado: "Pagado",
  pendiente: "Pendiente",
  manual: "Sin pago registrado",
};

export default async function SorteoVentasPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const resultado = await cargarVentas(params.id);

  if (!resultado.ok) {
    if (resultado.motivo === "sin-sesion") redirect("/login");
    if (resultado.motivo === "sin-permiso") redirect("/admin/sorteos");
    if (resultado.motivo === "error") {
      return (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6">
          <p className="font-medium">No se pudo cargar la planilla de ventas.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Probá de nuevo en un rato. Si persiste, puede faltar aplicar la
            migración 0091.
          </p>
        </div>
      );
    }
    notFound();
  }

  const { sorteo, filas, resumen } = resultado;

  const qRaw = searchParams?.q;
  const q = (Array.isArray(qRaw) ? qRaw[0] : (qRaw ?? "")).trim().toLowerCase();
  const qTexto = Array.isArray(qRaw) ? (qRaw[0] ?? "") : (qRaw ?? "");
  const visibles = q
    ? filas.filter((f) => {
        if (f.nombre.toLowerCase().includes(q)) return true;
        if ((f.telefono ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, ""))) return true;
        if (f.numeros.includes(Number(q))) return true;
        return f.numeros.join(",").includes(q);
      })
    : filas;

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
            Quién compró qué y cuánta plata entró. {formatPrice(sorteo.precio)} por
            número.
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Números vendidos</p>
          <p className="mt-1 text-2xl font-semibold">{resumen.numeros.toLocaleString("es-AR")}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Compradores</p>
          <p className="mt-1 text-2xl font-semibold">{resumen.compradores.toLocaleString("es-AR")}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Cobrado</p>
          <p className="mt-1 text-2xl font-semibold">{formatPrice(resumen.cobrado)}</p>
          <p className="text-xs text-muted-foreground">
            Devoluciones: {formatPrice(resumen.devuelto)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Neto</p>
          <p className="mt-1 text-2xl font-semibold">{formatPrice(resumen.neto)}</p>
          <p className="text-xs text-muted-foreground">Cobrado menos devuelto</p>
        </div>
      </div>

      {resumen.anonimos > 0 && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
          <strong>{resumen.anonimos}</strong> número(s) figuran vendidos sin comprador
          registrado. Pasa cuando se marcan a mano desde «Gestionar números» sin una reserva
          previa. Aparecen abajo como «Sin comprador registrado».
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
        <>
          <form className="flex flex-wrap items-center gap-2" action="">
            <input
              type="search"
              name="q"
              defaultValue={qTexto}
              placeholder="Buscar por nombre, teléfono o número"
              className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Buscar en la planilla de ventas"
            />
            <Button type="submit" variant="outline" size="sm">
              Buscar
            </Button>
            {q && (
              <Link
                href={`/admin/sorteos/${sorteo.id}/ventas`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Limpiar
              </Link>
            )}
          </form>

          {visibles.length === 0 ? (
            <p className="rounded-lg border border-hairline bg-panel-1 p-4 text-sm text-fg-subtle">
              No hay compradores que coincidan con «{qTexto}».
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Comprador</th>
                    <th className="px-3 py-2 font-medium">Teléfono</th>
                    <th className="px-3 py-2 font-medium text-right">Números</th>
                    <th className="px-3 py-2 font-medium">Cuáles</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="px-3 py-2 font-medium text-right">Cobrado</th>
                    <th className="px-3 py-2 font-medium text-right">Neto</th>
                    <th className="px-3 py-2 font-medium">Última venta</th>
                    <th className="px-3 py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((fila) => (
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
                      <td className="px-3 py-2 text-xs">
                        <span
                          className={
                            fila.estadoPago === "pagado"
                              ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-300"
                              : fila.estadoPago === "pendiente"
                                ? "rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300"
                                : "rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
                          }
                        >
                          {ESTADO_LABEL[fila.estadoPago ?? "manual"] ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatPrice(fila.cobrado ?? 0)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatPrice(fila.neto ?? fila.total)}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {fecha(fila.ultimaVenta)}
                      </td>
                      <td className="px-3 py-2">
                        {fila.numeros.length > 0 ? (
                          <VentasAcciones
                            raffleId={sorteo.id}
                            numbers={fila.numeros}
                            nombre={fila.nombre}
                            sinPago={fila.numerosSinPago ?? []}
                            precio={sorteo.precio}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30">
                  <tr className="border-t">
                    <td className="px-3 py-2 font-medium" colSpan={2}>
                      {visibles.length} fila(s)
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {resumen.numeros}
                    </td>
                    <td />
                    <td />
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatPrice(resumen.cobrado)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatPrice(resumen.neto)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground">
        La planilla muestra nombre y teléfono, no email ni DNI: es lo que hace falta para
        validar una transferencia. «Devolver y liberar» registra la devolución por lo
        cobrado y deja el número disponible; queda auditado con el motivo.
      </p>
    </div>
  );
}
