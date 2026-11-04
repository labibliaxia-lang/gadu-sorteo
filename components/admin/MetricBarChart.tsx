"use client";

import { Coins, Users, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/ui/empty-state";
import { formatPrice } from "@/lib/utils";

export interface MetricBarPoint {
  /** `YYYY-MM-DD` en hora de Argentina. */
  day: string;
  value: number;
}

const nf = new Intl.NumberFormat("es-AR");

function shortDay(day: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(day);
  return match ? `${match[2]}/${match[1]}` : day;
}

function longDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : day;
}

/** Eje de pesos: compacto para que no coma ancho en mobile. */
function compactArs(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toLocaleString("es-AR", {
      maximumFractionDigits: 1,
    })}M`;
  }
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

type Tone = "gold" | "amber";

/**
 * Tonos del sistema. En oscuro se usan los ámbar canónicos; sobre fondo claro
 * bajan a brand-700/800 porque el amarillo puro no alcanza contraste.
 */
const TONES: Record<Tone, { dark: string; light: string }> = {
  amber: { dark: "#FFD23A", light: "#B37F00" },
  gold: { dark: "#F5B301", light: "#8C6400" },
};

type EmptyIcon = "users" | "coins";

const EMPTY_ICONS: Record<EmptyIcon, LucideIcon> = {
  users: Users,
  coins: Coins,
};

interface Props {
  data: MetricBarPoint[];
  /** Nombre de la serie (eje, tooltip y leyenda accesible). */
  label: string;
  tone: Tone;
  valueType: "count" | "ars";
  /**
   * Icono serializable: el dashboard es un Server Component y no puede pasar
   * componentes/funciones a este Client Component.
   */
  empty: {
    icon: EmptyIcon;
    title: string;
    description: string;
  };
}

/**
 * Gráfico de barras por día para las métricas del dashboard (usuarios nuevos,
 * ingresos estimados). Mismo marco visual que `TrafficChart`: 220px fijos,
 * `ResponsiveContainer`, colores del sistema y sin animación pesada. No toca
 * `window` en render.
 */
export function MetricBarChart({
  data,
  label,
  tone,
  valueType,
  empty,
}: Props) {
  const { resolvedTheme } = useTheme();
  const color = resolvedTheme === "light" ? TONES[tone].light : TONES[tone].dark;

  const total = data.reduce((sum, point) => sum + (Number(point.value) || 0), 0);

  if (data.length === 0 || total === 0) {
    return (
      <EmptyState
        icon={EMPTY_ICONS[empty.icon]}
        title={empty.title}
        description={empty.description}
      />
    );
  }

  const formatValue =
    valueType === "ars"
      ? (value: number) => formatPrice(value)
      : (value: number) => nf.format(value);
  const formatAxis =
    valueType === "ars"
      ? (value: number) => compactArs(value)
      : (value: number) => nf.format(value);

  const summary = `${label}: ${formatValue(total)} en los últimos ${
    data.length
  } días.`;

  return (
    <div
      className="h-[220px] w-full"
      role="img"
      aria-label={summary}
      data-testid="metric-bar-chart"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: -14 }}
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
            width={valueType === "ars" ? 56 : 40}
            tickFormatter={formatAxis}
          />
          <Tooltip
            cursor={{ fill: "var(--panel-2)", opacity: 0.6 }}
            contentStyle={{
              backgroundColor: "var(--panel-2)",
              border: "1px solid var(--hairline-strong)",
              borderRadius: "0.5rem",
              color: "var(--fg)",
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--fg-muted)", marginBottom: 4 }}
            itemStyle={{ color: "var(--fg)" }}
            labelFormatter={(value) => longDay(String(value))}
            formatter={(value) => [formatValue(Number(value) || 0), label]}
          />
          <Bar
            dataKey="value"
            name={label}
            fill={color}
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
