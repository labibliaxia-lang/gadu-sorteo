import { useTranslations } from "next-intl";
import { Crown, Lock } from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Plan } from "@/lib/types";

export interface PremiumGateProps {
  /** Plan del usuario (alternativa a `isPremium`). */
  plan?: Plan | string | null;
  /** Resultado de `getPlanContext(profile).isPremium`. */
  isPremium?: boolean;
  /** Nombre corto de la función bloqueada. */
  feature?: string;
  title?: string;
  description?: string;
  /** Versión compacta (banner inline) para formularios o listas. */
  compact?: boolean;
  children: React.ReactNode;
}

/**
 * Bloquea contenido exclusivo del plan premium.
 * Si el usuario es premium renderiza `children`; si no, muestra una tarjeta
 * con el CTA para canjear un código en `/planes`.
 */
export function PremiumGate({
  plan,
  isPremium,
  feature,
  title,
  description,
  compact,
  children,
}: PremiumGateProps) {
  const t = useTranslations("AdminPremiumGate");
  const premium = isPremium ?? plan === "premium";

  if (premium) return <>{children}</>;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-panel-1 p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-panel-3 text-brand-accent ring-1 ring-hairline">
          <Crown className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">
            {title ??
              (feature
                ? t("compactTitle", { feature })
                : t("compactTitleFallback"))}
          </p>
          <p className="text-[12px] text-fg-subtle">
            {description ?? t("compactDescription")}
          </p>
        </div>
        <LocaleLink
          href="/planes"
          className={buttonVariants({ size: "sm" })}
        >
          {t("redeem")}
        </LocaleLink>
      </div>
    );
  }

  return (
    <Card className="relative overflow-hidden border-hairline">
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2.5 text-lg">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-panel-3 text-brand-accent ring-1 ring-hairline">
            <Crown className="h-4 w-4" aria-hidden="true" />
          </span>
          {title ??
            (feature ? t("featureTitleWith", { feature }) : t("featureTitle"))}
        </CardTitle>
        <p className="flex items-start gap-2 text-[13px] text-fg-subtle">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {description ?? t("description")}
        </p>
      </CardHeader>

      <CardContent className="flex flex-wrap items-center gap-3">
        <LocaleLink
          href="/planes"
          className={buttonVariants({ size: "sm" })}
        >
          {t("redeemPremium")}
        </LocaleLink>
        <span className="text-[12px] text-fg-subtle">
          {t("alreadyHave", { path: "/planes" })}
        </span>
      </CardContent>
    </Card>
  );
}
