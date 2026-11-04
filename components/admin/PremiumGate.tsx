import Link from "next/link";
import { Crown, Lock } from "lucide-react";

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
            {title ?? `${feature ?? "Esta función"} es Premium`}
          </p>
          <p className="text-[12px] text-fg-subtle">
            {description ??
              "Canjeá un código premium para desbloquear esta función."}
          </p>
        </div>
        <Link href="/planes" className={buttonVariants({ size: "sm" })}>
          Canjear código
        </Link>
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
          {title ?? `Función Premium${feature ? `: ${feature}` : ""}`}
        </CardTitle>
        <p className="flex items-start gap-2 text-[13px] text-fg-subtle">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {description ??
            "Esta función está disponible solo con el plan Premium. Mejorá tu plan para desbloquearla."}
        </p>
      </CardHeader>

      <CardContent className="flex flex-wrap items-center gap-3">
        <Link href="/planes" className={buttonVariants({ size: "sm" })}>
          Canjear código premium
        </Link>
        <span className="text-[12px] text-fg-subtle">
          ¿Ya tenés un código? Canjealo en{" "}
          <code className="font-mono">/planes</code>.
        </span>
      </CardContent>
    </Card>
  );
}
