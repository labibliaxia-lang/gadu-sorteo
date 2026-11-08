import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Download, Phone } from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { cargarVentas } from "./_datos";
import { VentasAcciones } from "@/components/admin/VentasAcciones";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Fecha corta y legible, sin depender de la zona del servidor. */
function fecha(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const intl =
    locale === "pt" ? "pt-BR" : locale === "en" ? "en-US" : "es-AR";
  return new Date(iso).toLocaleString(intl, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export default async function SorteoVentasPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const t = await getTranslations("AdminSorteosVentas");
  const locale = await getLocale();
  const resultado = await cargarVentas(params.id);

  if (!resultado.ok) {
    if (resultado.motivo === "sin-sesion") redirect("/login");
    if (resultado.motivo === "sin-permiso") redirect("/admin/sorteos");
    if (resultado.motivo === "error") {
      return (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6">
          <p className="font-medium">{t("error.title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("error.text")}
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

  const premiosTotal = filas.reduce(
    (suma, fila) => suma + (fila.numerosPremio ?? []).length,
    0,
  );

  const ESTADO_LABEL: Record<string, string> = {
    pagado: t("status.paid"),
    pendiente: t("status.pending"),
    manual: t("status.manual"),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <LocaleLink
            href={`/admin/sorteos/${sorteo.id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {t("back")}
          </LocaleLink>
          <h2 className="text-xl font-semibold">
            {t("title", { title: sorteo.title })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("subtitle", { price: formatPrice(sorteo.precio, locale) })}
          </p>
        </div>

        {filas.length > 0 && (
          <a
            href={`/admin/sorteos/${sorteo.id}/ventas/export`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download className="mr-1.5 h-4 w-4" /> {t("downloadCsv")}
          </a>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("stats.sold")}</p>
          <p className="mt-1 text-2xl font-semibold">{resumen.numeros.toLocaleString(locale)}</p>
          {premiosTotal > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t("stats.prize", { count: premiosTotal })}
            </p>
          )}
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("stats.buyers")}</p>
          <p className="mt-1 text-2xl font-semibold">{resumen.compradores.toLocaleString(locale)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("stats.collected")}</p>
          <p className="mt-1 text-2xl font-semibold">{formatPrice(resumen.cobrado, locale)}</p>
          <p className="text-xs text-muted-foreground">
            {t("stats.refunds", { amount: formatPrice(resumen.devuelto, locale) })}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("stats.net")}</p>
          <p className="mt-1 text-2xl font-semibold">{formatPrice(resumen.neto, locale)}</p>
          <p className="text-xs text-muted-foreground">{t("stats.netHint")}</p>
        </div>
      </div>

      {resumen.anonimos > 0 && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
          {t.rich("anonWarning", {
            count: resumen.anonimos,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      )}

      {filas.length === 0 ? (
        <div className="rounded-xl border bg-muted/30 p-8 text-center">
          <p className="font-medium">{t("empty.title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("empty.text")}
          </p>
        </div>
      ) : (
        <>
          <form className="flex flex-wrap items-center gap-2" action="">
            <input
              type="search"
              name="q"
              defaultValue={qTexto}
              placeholder={t("search.placeholder")}
              className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm"
              aria-label={t("search.aria")}
            />
            <Button type="submit" variant="outline" size="sm">
              {t("search.submit")}
            </Button>
            {q && (
              <LocaleLink
                href={`/admin/sorteos/${sorteo.id}/ventas`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                {t("search.clear")}
              </LocaleLink>
            )}
          </form>

          {visibles.length === 0 ? (
            <p className="rounded-lg border border-hairline bg-panel-1 p-4 text-sm text-fg-subtle">
              {t("noMatches", { query: qTexto })}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t("table.buyer")}</th>
                    <th className="px-3 py-2 font-medium">{t("table.phone")}</th>
                    <th className="px-3 py-2 font-medium text-right">{t("table.numbers")}</th>
                    <th className="px-3 py-2 font-medium">{t("table.which")}</th>
                    <th className="px-3 py-2 font-medium">{t("table.status")}</th>
                    <th className="px-3 py-2 font-medium text-right">{t("table.collected")}</th>
                    <th className="px-3 py-2 font-medium text-right">{t("table.net")}</th>
                    <th className="px-3 py-2 font-medium">{t("table.lastSale")}</th>
                    <th className="px-3 py-2 font-medium">{t("table.actions")}</th>
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
                        {(fila.numerosPremio ?? []).length > 0 && (
                          <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
                            {t("table.prizeLabel")}{" "}
                            <span className="font-mono">
                              {(fila.numerosPremio ?? []).join(", ")}
                            </span>
                          </span>
                        )}
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
                        {formatPrice(fila.cobrado ?? 0, locale)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatPrice(fila.neto ?? fila.total, locale)}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {fecha(fila.ultimaVenta, locale)}
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
                      {t("table.rows", { count: visibles.length })}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {resumen.numeros}
                    </td>
                    <td />
                    <td />
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatPrice(resumen.cobrado, locale)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatPrice(resumen.neto, locale)}
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
        {t("footnote")}
      </p>
    </div>
  );
}
