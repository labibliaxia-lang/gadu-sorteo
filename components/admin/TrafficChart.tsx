"use client";

import { useTheme } from "next-themes";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import type { TrafficPoint } from "@/lib/page-views";

/**
 * Serie diaria de tráfico de la plataforma (Home + páginas de sorteo).
 *
 * Client component a propósito: recharts mide el ancho real del contenedor con
 * `ResponsiveContainer`, así que necesita el DOM. No toca `window` en render:
 * el `ResponsiveContainer` va dentro de un contenedor con altura fija (260px)
 * y en SSR sólo pinta el marco vacío hasta hidratar.
 *
 * Colores: la paleta ámbar del sistema. En oscuro se usan los dos tonos
 * canónicos (brand-500 y brand-300); sobre fondo claro esos amarillos no
 * alcanzan contraste, así que la segunda serie baja a brand-700/800. Nada de
 * gradientes ni animaciones pesadas: `isAnimationActive={false}` para que la
 * serie aparezca ya dibujada.
 */
const palette = {
  dark: { views: "#F5B301", visitors: "#FFD23A" },
  light: { views: "#B37F00", visitors: "#8C6400" },
};

const numberFormatter = new Intl.NumberFormat("es-AR");

/** `YYYY-MM-DD` -> `dd/mm` (la fecha ya viene en hora de Argentina). */
function shortDay(day: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(day);
  return match ? `${match[2]}/${match[1]}` : day;
}

/** `YYYY-MM-DD` -> `dd/mm/aaaa` para el tooltip. */
function longDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : day;
}

export function TrafficChart({ data }: { data: TrafficPoint[] }) {
  const { resolvedTheme } = useTheme();
  const colors = resolvedTheme === "light" ? palette.light : palette.dark;
  const totalViews = data.reduce((sum, point) => sum + point.views, 0);
  const totalVisitors = data.reduce((sum, point) => sum + point.visitors, 0);

  if (data.length === 0 || totalViews === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="Todavía no hay visitas registradas"
        description="Cuando alguien entre a la home o a la página de un sorteo, acá vas a ver la serie diaria de los últimos 30 días."
      />
    );
  }

  const summary = `Tráfico de los últimos ${data.length} días: ${numberFormatter.format(
    totalViews,
  )} visitas y ${numberFormatter.format(
    totalVisitors,
  )} visitantes autenticados únicos.`;

  return (
    <figure className="space-y-3">
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-subtle">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: colors.views }}
          />
          Visitas
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: colors.visitors }}
          />
          Visitantes autenticados únicos
        </span>
        <span className="ml-auto font-mono tabular-nums">
          {numberFormatter.format(totalViews)} visitas ·{" "}
          {numberFormatter.format(totalVisitors)} visitantes
        </span>
      </figcaption>

      <div
        className="h-[260px] w-full"
        role="img"
        aria-label={summary}
        data-testid="traffic-chart"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--hairline)"
              vertical={false}
            />
            <XAxis
              dataKey="day"
              tickFormatter={shortDay}
              tick={{ fontSize: 11, fill: "var(--fg-subtle)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--hairline)" }}
              minTickGap={28}
              interval="preserveStartEnd"
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "var(--fg-subtle)" }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "var(--hairline-strong)", strokeWidth: 1 }}
              contentStyle={{
                backgroundColor: "var(--panel-2)",
                border: "1px solid var(--hairline-strong)",
                borderRadius: "0.5rem",
                color: "var(--fg)",
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--fg-muted)", marginBottom: 4 }}
              itemStyle={{ color: "var(--fg)" }}
              labelFormatter={(label) => longDay(String(label))}
              formatter={(value, name) => [
                numberFormatter.format(Number(value) || 0),
                String(name) === "views" ? "Visitas" : "Visitantes únicos",
              ]}
            />
            <Line
              type="monotone"
              dataKey="views"
              name="views"
              stroke={colors.views}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="visitors"
              name="visitors"
              stroke={colors.visitors}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[11px] text-fg-subtle">
        Visitas: todas las vistas registradas. Visitantes: cuentas
        autenticadas únicas del día (las visitas anónimas no se pueden
        distinguir entre sí sin guardar un identificador, y no se guarda).
      </p>
    </figure>
  );
}
