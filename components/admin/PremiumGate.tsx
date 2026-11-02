import Link from "next/link";
import { Crown, Lock } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white">
          <Crown className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {title ?? `${feature ?? "Esta función"} es Premium`}
          </p>
          <p className="text-xs text-muted-foreground">
            {description ??
              "Canjeá un código premium para desbloquear esta función."}
          </p>
        </div>
        <Link
          href="/planes"
          className={cn(
            buttonVariants({ size: "sm" }),
            "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700",
          )}
        >
          Canjear código
        </Link>
      </div>
    );
  }

  return (
    <Card className="relative overflow-hidden border-violet-500/30">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-600 to-fuchsia-600" />

      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white">
            <Crown className="h-4 w-4" />
          </span>
          {title ?? `Función Premium${feature ? `: ${feature}` : ""}`}
        </CardTitle>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          {description ??
            "Esta función está disponible solo con el plan Premium. Mejorá tu plan para desbloquearla."}
        </p>
      </CardHeader>

      <CardContent className="flex flex-wrap items-center gap-3">
        <Link
          href="/planes"
          className={cn(
            buttonVariants({ size: "sm" }),
            "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700",
          )}
        >
          <Crown className="mr-1.5 h-4 w-4" />
          Canjear código premium
        </Link>
        <span className="text-xs text-muted-foreground">
          ¿Ya tenés un código? Canjealo en <code className="font-mono">/planes</code>.
        </span>
      </CardContent>
    </Card>
  );
}
