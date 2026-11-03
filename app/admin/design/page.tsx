import { redirect } from "next/navigation";
import {
  CheckCircle2,
  MousePointerClick,
  Palette,
  Table2,
  Type,
} from "lucide-react";

import { requireAdminSession } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ResponsiveTable } from "@/components/ui/responsive-table";

export const dynamic = "force-dynamic";

const sampleRows = [
  { id: "1", raffle: "Sorteo de herramientas", sold: 128, status: "Activo" },
  { id: "2", raffle: "Set de llaves premium", sold: 64, status: "Cerrado" },
  { id: "3", raffle: "Taladro inalámbrico", sold: 41, status: "Sorteado" },
];

const swatches = [
  { name: "brand-500", value: "#F5B301", className: "bg-brand-500" },
  { name: "brand-700", value: "#B37F00", className: "bg-brand-700" },
  { name: "ink", value: "#071726", className: "bg-ink" },
  { name: "steel", value: "#64748B", className: "bg-steel" },
  { name: "surface", value: "#F7F9FB", className: "bg-surface" },
];

export default async function DesignPreviewPage() {
  const actor = await requireAdminSession();
  if (!actor) redirect("/login");

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Fase 1 · Sistema de diseño
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Antes / después en una pantalla
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Mismos flujos, nueva piel: tipografía, color, radios, sombras y el
          patrón tabla→tarjetas. Nada de lógica de pagos ni sorteos cambió.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border-2 border-dashed border-steel-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Antes
          </p>
          <div className="rounded-lg border border-slate-300 bg-white p-6 shadow-lg">
            <h3 className="text-2xl font-semibold leading-none tracking-tight">
              Sorteo de herramientas
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Tarjeta con sombra fuerte, borde gris y tipografía del sistema.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-md">
                Acción principal
              </button>
              <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900">
                Secundaria
              </button>
            </div>
          </div>
          <input
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            placeholder="Campo sin foco de marca"
          />
        </div>

        <div className="space-y-3 rounded-xl border border-brand-500/40 bg-brand-50/40 p-4 dark:bg-brand-900/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
            Después
          </p>
          <Card>
            <CardHeader>
              <CardTitle>Sorteo de herramientas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Sombra suave, borde de sistema y Space Grotesk en el título.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button>Acción principal</Button>
                <Button variant="outline">Secundaria</Button>
                <Button variant="success">Pago confirmado</Button>
              </div>
              <Input placeholder="Campo con foco ámbar" />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Palette className="h-4 w-4 text-brand-600" />
            <CardTitle className="text-base">Paleta</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-5 gap-2">
            {swatches.map((swatch) => (
              <div key={swatch.name} className="space-y-1">
                <div
                  className={`h-10 rounded-md border ${swatch.className}`}
                  title={swatch.value}
                />
                <p className="truncate text-[10px] text-muted-foreground">
                  {swatch.name}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Type className="h-4 w-4 text-brand-600" />
            <CardTitle className="text-base">Tipografía</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-display text-2xl font-bold">Space Grotesk</p>
            <p className="text-sm text-muted-foreground">
              Inter para cuerpos y formularios.
            </p>
            <p className="font-mono text-sm">0123 4567 · hash</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-brand-600" />
            <CardTitle className="text-base">Estados</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge>Activo</Badge>
            <Badge variant="success">Pagado</Badge>
            <Badge variant="warning">Pendiente</Badge>
            <Badge variant="info">Reservado</Badge>
            <Badge variant="destructive">Cancelado</Badge>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 text-brand-600" />
          <h2 className="font-display text-xl font-semibold">
            Tabla en desktop, tarjetas en móvil
          </h2>
        </div>
        <ResponsiveTable
          rows={sampleRows}
          getRowKey={(row) => row.id}
          columns={[
            {
              key: "raffle",
              header: "Sorteo",
              render: (row) => (
                <span className="font-medium">{row.raffle}</span>
              ),
            },
            {
              key: "sold",
              header: "Vendidos",
              align: "right",
              render: (row) => row.sold,
            },
            {
              key: "status",
              header: "Estado",
              align: "right",
              render: (row) => (
                <Badge
                  variant={
                    row.status === "Activo"
                      ? "success"
                      : row.status === "Cerrado"
                        ? "warning"
                        : "secondary"
                  }
                >
                  {row.status}
                </Badge>
              ),
            },
          ]}
          empty={
            <EmptyState
              title="Sin movimientos"
              description="Cuando haya ventas vas a verlas acá."
            />
          }
        />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MousePointerClick className="h-3.5 w-3.5" />
          Achicá la ventana a menos de 768 px para ver la versión en tarjetas.
        </p>
      </section>

      <section className="rounded-2xl border bg-ink p-6 text-white">
        <div className="blueprint-grid rounded-xl p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-brand-300">
            Identidad
          </p>
          <p className="font-display mt-2 max-w-md text-2xl font-bold">
            Herramientas, premios y sorteos que se pueden verificar.
          </p>
          <p className="mt-2 max-w-md text-sm text-white/70">
            El plano técnico y el amarillo seguridad son la base de la marca; no
            hace falta otro degradé.
          </p>
        </div>
      </section>
    </div>
  );
}
