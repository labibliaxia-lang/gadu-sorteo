import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, ChevronRight, ShieldCheck, ShieldQuestion } from "lucide-react";

import type { Confianza } from "@/lib/confianza";
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
  const t = useTranslations("BarraConfianza");
  const { nivel, puntaje, motivos, advertencia } = confianza;

  const levelLabel =
    nivel === "con-problemas"
      ? t("levelConProblemas")
      : nivel === "confiable"
        ? t("levelConfiable")
        : t("levelSinHistorial");

  /** Los motivos vienen de `lib/confianza` en español; acá se traducen. */
  function translateReason(reason: string): string {
    const reviewWithRating = reason.match(
      /^(\d+) reseñas? de compradores \(([\d.]+)\/5\)$/,
    );
    if (reviewWithRating) {
      return t("reasonReviewsRating", {
        count: Number(reviewWithRating[1]),
        rating: reviewWithRating[2],
      });
    }
    const reviews = reason.match(/^(\d+) reseñas? de compradores$/);
    if (reviews) {
      return t("reasonReviews", { count: Number(reviews[1]) });
    }
    const completed = reason.match(/^(\d+) sorteos? completados?$/);
    if (completed) {
      return t("reasonCompleted", { count: Number(completed[1]) });
    }
    const cancelled = reason.match(/^(\d+) cancelados?$/);
    if (cancelled) {
      return t("reasonCancelled", { count: Number(cancelled[1]) });
    }
    const noWeight = reason.match(/^(\d+) reseñas? todavía sin peso$/);
    if (noWeight) {
      return t("reasonReviewsNoWeight", { count: Number(noWeight[1]) });
    }
    const refunds = reason.match(/^(\d+) devoluciones? sin pagar$/);
    if (refunds) {
      return t("reasonRefunds", { count: Number(refunds[1]) });
    }
    const reports = reason.match(/^(\d+) denuncias? sin resolver$/);
    if (reports) {
      return t("reasonReports", { count: Number(reports[1]) });
    }
    const active = reason.match(/^(\d+) sorteos? en curso$/);
    if (active) {
      return t("reasonActive", { count: Number(active[1]) });
    }
    if (reason.startsWith("Identidad verificada")) {
      return t("reasonIdentity");
    }
    return reason;
  }

  const warning = advertencia
    ? advertencia.includes("devoluciones sin pagar")
      ? t("warningDebt")
      : advertencia.includes("denuncias sin resolver")
        ? t("warningReports")
        : advertencia.includes("todavía no completó")
          ? t("warningNoHistory")
          : advertencia
    : null;

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
      {warning && (
        <p
          className={cn(
            "rounded-lg border p-2 text-xs",
            nivel === "con-problemas"
              ? "border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-200"
              : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
          )}
        >
          {warning}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", color)}>
          <Icono className="h-4 w-4" aria-hidden="true" />
          {levelLabel}
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
            ? t("ariaScore", {
                score: puntaje,
                level: levelLabel.toLowerCase(),
              })
            : t("ariaLevel", { level: levelLabel.toLowerCase() })
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
            <li key={motivo}>· {translateReason(motivo)}</li>
          ))}
        </ul>
      )}

      {hrefResenas && (
        <Link
          href={hrefResenas}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          {t("reviewsLink")}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
