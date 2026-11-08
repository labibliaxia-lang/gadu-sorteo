"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";

import { countdownState } from "@/lib/countdown";
import { cn, formatDateTime } from "@/lib/utils";
import type { RaffleStatus } from "@/lib/types";

/**
 * Cuenta regresiva de la fecha del sorteo.
 *
 * `draw_date` es obligatoria en `raffles`, así que todo sorteo en venta tiene
 * fecha: no es opcional del organizador. Antes de montar —servidor y primer
 * render del cliente— se muestra la fecha exacta, para no romper la hidratación.
 */
export function RaffleCountdown({
  drawDate,
  status,
  compact = false,
  className,
}: {
  drawDate: string;
  status: RaffleStatus;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("RaffleCountdown");
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (now === null) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-mono text-[11px] text-fg-subtle",
          className,
        )}
      >
        <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
        {formatDateTime(drawDate)}
      </span>
    );
  }

  const state = countdownState(now, drawDate, status);
  if (state.kind === "inactive") return null;

  if (state.kind === "reached") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-mono text-[11px] text-amber-500",
          className,
        )}
      >
        <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
        {t("reached")}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[11px]",
        compact ? "text-fg-subtle" : "text-fg",
        className,
      )}
    >
      <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>
        {compact ? t("closesIn") : t("remaining")}
        <span className="tabular-nums">{state.label}</span>
        {!compact && (
          <span className="text-fg-subtle"> · {formatDateTime(drawDate)}</span>
        )}
      </span>
    </span>
  );
}
