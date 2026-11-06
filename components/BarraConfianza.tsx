import Link from "next/link";
import { AlertTriangle, ChevronRight, ShieldCheck, ShieldQuestion } from "lucide-react";

import { ETIQUETA_NIVEL, type Confianza } from "@/lib/confianza";
import { cn } from "@/lib/utils";

/**
 * Semáforo de confianza del organizador.
 *
 * Nunca muestra un color solo: debajo van los motivos, porque un semáforo
 * opaco contradice el resto del producto, donde todo se puede verificar. Y si
 * hay algo mal, el aviso aparece antes que la barra, no escondido al final.
 */
export function BarraConfianza({
  confianza,
  hrefResenas,
  className,
}: {
  confianza: Confianza;
  hrefResenas?: string;
  className?: string;
}) {
  const { nivel, puntaje, motivos, advertencia } = confianza;

  const color =
    nivel === "con-problemas"
      ? "text-red-700 dark:text-red-300"
      : nivel === "confiable"
        ? "text-emerald-700 dark:text-emerald-300"
        : "text-muted-foreground";

  const Icono =
    nivel === "con-problemas" ? AlertTriangle : nivel === "confiable" ? ShieldCheck : ShieldQuestion;

  return (
    <div className={cn("space-y-2 rounded-xl border bg-card p-3", className)}>
      {advertencia && (
        <p
          className={cn(
            "rounded-lg border p-2 text-xs",
            nivel === "con-problemas"
              ? "border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-200"
              : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
          )}
        >
          {advertencia}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", color)}>
          <Icono className="h-4 w-4" aria-hidden="true" />
          {ETIQUETA_NIVEL[nivel]}
        </span>
        {nivel === "confiable" && (
          <span className="font-mono text-xs text-muted-foreground">{puntaje}/100</span>
        )}
      </div>

      {/* Barra: degradé fijo de rojo a verde y un marcador en el puntaje. En
          «sin historial» no se marca nada, porque no hay nada que puntuar. */}
      <div
        className="relative h-2 overflow-hidden rounded-full"
        role="img"
        aria-label={
          nivel === "confiable"
            ? `Confianza ${puntaje} de 100, ${ETIQUETA_NIVEL[nivel].toLowerCase()}`
            : `Confianza: ${ETIQUETA_NIVEL[nivel].toLowerCase()}`
        }
      >
        <div className="absolute inset-0 bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500 opacity-30" />
        {nivel === "confiable" && (
          <div
            className="absolute top-1/2 h-3.5 w-1.5 -translate-y-1/2 rounded-full bg-foreground shadow"
            style={{ left: `calc(${puntaje}% - 3px)` }}
          />
        )}
        {nivel === "con-problemas" && (
          <div className="absolute inset-y-0 left-0 w-[12%] bg-red-600" />
        )}
      </div>

      {motivos.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {motivos.slice(0, 4).map((motivo) => (
            <li key={motivo}>· {motivo}</li>
          ))}
        </ul>
      )}

      {hrefResenas && (
        <Link
          href={hrefResenas}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          Ver reseñas y sorteos del organizador
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
