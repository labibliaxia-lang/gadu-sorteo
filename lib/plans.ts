import type { Plan } from "@/lib/types";

/**
 * Matriz única de entitlements por plan.
 * Fuente de verdad de la UI; la base de datos replica estos límites
 * (migraciones 0023 / 0024) para que no se puedan saltar por API.
 *
 *   organizador: 2 sorteos activos · 100 números por sorteo · sin analíticas
 *   premium    : 20 sorteos activos · 10.000 números por sorteo · analíticas
 */
export interface PlanLimits {
  id: Plan;
  label: string;
  description: string;
  /** Sorteos simultáneos con estado "active". */
  maxActiveRaffles: number;
  /** Tope de números por sorteo. */
  maxNumbersPerRaffle: number;
  /** Panel de analíticas avanzadas. */
  analytics: boolean;
  /** Funciones exclusivas premium (marketing, branding, etc.). */
  exclusiveFeatures: boolean;
  /** Métodos de pago habilitados. */
  paymentMethods: readonly ("transferencia" | "mercadopago")[];
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  organizador: {
    id: "organizador",
    label: "Organizador",
    description: "Plan base para publicar tus primeros sorteos.",
    maxActiveRaffles: 2,
    maxNumbersPerRaffle: 100,
    analytics: false,
    exclusiveFeatures: false,
    paymentMethods: ["transferencia"],
  },
  premium: {
    id: "premium",
    label: "Premium",
    description:
      "Límites ampliados, analíticas y todas las herramientas de crecimiento.",
    maxActiveRaffles: 20,
    maxNumbersPerRaffle: 10_000,
    analytics: true,
    exclusiveFeatures: true,
    paymentMethods: ["transferencia", "mercadopago"],
  },
};

export interface PlanProfileLike {
  plan?: string | null;
  role?: string | null;
}

export interface PlanContext {
  plan: Plan;
  limits: PlanLimits;
  isPremium: boolean;
  role: string | null;
  isSuperadmin: boolean;
}

/** Normaliza un valor desconocido al plan canónico (común por defecto). */
export function normalizePlan(value: unknown): Plan {
  return value === "premium" ? "premium" : "organizador";
}

/** Contexto de plan a partir del perfil (o `null` si no hay sesión). */
export function getPlanContext(
  profile: PlanProfileLike | null | undefined,
): PlanContext {
  const plan = normalizePlan(profile?.plan);

  return {
    plan,
    limits: PLAN_LIMITS[plan],
    isPremium: plan === "premium",
    role: profile?.role ?? null,
    isSuperadmin: profile?.role === "superadmin",
  };
}

/** ¿Puede crear/publicar otro sorteo activo con su plan actual? */
export function canCreateRaffle(
  context: PlanContext,
  activeRaffles: number,
): boolean {
  if (context.isSuperadmin) return true;
  return activeRaffles < context.limits.maxActiveRaffles;
}

/** ¿Puede generar esta cantidad de números en un sorteo? */
export function canUseNumbers(
  context: PlanContext,
  numbers: number,
): boolean {
  if (context.isSuperadmin) return true;
  return (
    Number.isFinite(numbers) &&
    numbers >= 10 &&
    numbers <= context.limits.maxNumbersPerRaffle
  );
}

/** ¿Tiene habilitadas las analíticas avanzadas? (superadmin siempre). */
export function hasAnalytics(context: PlanContext): boolean {
  return context.isSuperadmin || context.limits.analytics;
}

/** Guard explícito para el módulo de Analíticas Avanzadas. */
export function canViewAnalytics(context: PlanContext): boolean {
  return hasAnalytics(context);
}

/** Métodos de pago disponibles para el plan. */
export function allowedPaymentMethods(
  context: PlanContext,
): PlanLimits["paymentMethods"] {
  return context.limits.paymentMethods;
}
