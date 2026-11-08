import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, Gift } from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { formatDateTime, formatPrice } from "@/lib/utils";
import { RaffleCountdown } from "@/components/RaffleCountdown";
import type { Raffle } from "@/lib/types";

/**
 * Tarjeta chica de sorteo para la sección «Más sorteos» de una landing.
 * Invita a la home y a los otros sorteos publicados (migración 0066 marca los
 * destacados que van primero).
 */
export function RaffleMiniCard({ raffle }: { raffle: Raffle }) {
  const t = useTranslations("RaffleMiniCard");
  const locale = useLocale();
  return (
    <LocaleLink
      href={`/sorteos/${raffle.id}`}
      className="group flex gap-3 rounded-xl border border-hairline bg-panel-1 p-3 transition-colors hover:border-hairline-strong"
    >
      <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-lg border border-hairline bg-panel-2">
        {raffle.cover_image_url ? (
          <Image
            src={raffle.cover_image_url}
            alt={raffle.title}
            fill
            sizes="96px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="flex h-full items-center justify-center">
            <Gift className="h-5 w-5 text-fg-subtle" aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {raffle.is_featured && (
          <span className="inline-flex rounded-full bg-brand-500/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-brand-accent">
            {t("featured")}
          </span>
        )}
        <p className="mt-1 truncate text-sm font-medium">{raffle.title}</p>
        <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-fg-subtle">
          <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />
          {formatDateTime(raffle.draw_date, locale)}
        </p>
        <span className="mt-0.5 block">
          <RaffleCountdown
            drawDate={raffle.draw_date}
            status={raffle.status}
            compact
          />
        </span>
        <p className="mt-1 font-mono text-[12px] text-fg">
          {formatPrice(Number(raffle.price_per_number), locale)}{" "}
          <span className="text-[11px] text-fg-subtle">
            {t("perNumber")}
          </span>
        </p>
      </div>
    </LocaleLink>
  );
}
