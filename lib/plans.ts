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
  /**
   * Tope de premios por sorteo.
   *
   * La base lo impone en `enforce_raffle_rules` (0059:33-52): organizador 3,
   * premium 30, superadmin 30. Si acá dijera otra cosa, el organizador podría
   * configurar 10 premios, completar el wizard y que la base le rechace el alta
   * al final.
   */
  maxPrizesPerRaffle: number;
  /** Panel de analíticas avanzadas. */
  analytics: boolean;
  /** Funciones exclusivas premium (marketing, branding, etc.). */
  exclusiveFeatures: boolean;
  /** Métodos de pago habilitados. */
  paymentMethods: readonly ("transferencia" | "mercadopago")[];
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    id: "free",
    label: "Free",
    description: "Prueba la plataforma con un sorteo.",
    maxActiveRaffles: 1,
    maxNumbersPerRaffle: 100,
    maxPrizesPerRaffle: 1,
    analytics: false,
    exclusiveFeatures: false,
    paymentMethods: ["transferencia"],
  },
  organizador: {
    id: "organizador",
    label: "Starter",
    description: "Plan base para publicar tus primeros sorteos.",
    maxActiveRaffles: 2,
    maxNumbersPerRaffle: 100,
    maxPrizesPerRaffle: 3,
    analytics: false,
    exclusiveFeatures: false,
    paymentMethods: ["transferencia"],
  },
  pro: {
    id: "pro",
    label: "Pro",
    description: "Para organizadores que ya crecieron.",
    maxActiveRaffles: 6,
    maxNumbersPerRaffle: 1000,
    maxPrizesPerRaffle: 10,
    analytics: true,
    exclusiveFeatures: true,
    paymentMethods: ["transferencia"],
  },
  premium: {
    id: "premium",
    label: "Premium",
    description:
      "Límites ampliados, analíticas y todas las herramientas de crecimiento.",
    maxActiveRaffles: 20,
    maxNumbersPerRaffle: 10_000,
    maxPrizesPerRaffle: 30,
    analytics: true,
    exclusiveFeatures: true,
    paymentMethods: ["transferencia", "mercadopago"],
  },
  social: {
    id: "social",
    label: "Social / ONG",
    description: "Precio solidario con herramientas de crecimiento.",
    maxActiveRaffles: 5,
    maxNumbersPerRaffle: 1000,
    maxPrizesPerRaffle: 5,
    analytics: false,
    exclusiveFeatures: true,
    paymentMethods: ["transferencia"],
  },
};

/**
 * Beneficios que se muestran en /planes.
 * Solo se listan cosas que existen: lo que todavía no está disponible se
 * rotula como «próximamente» para no vender humo.
 */
export const PLAN_BENEFITS: Record<Plan, string[]> = {
  free: [
    `${PLAN_LIMITS.free.maxActiveRaffles} sorteo activo`,
    `${PLAN_LIMITS.free.maxNumbersPerRaffle} números por sorteo`,
    "Cobro por transferencia con comprobante",
    "Perfil público de organizador",
  ],
  organizador: [
    `Hasta ${PLAN_LIMITS.organizador.maxActiveRaffles} sorteos activos a la vez`,
    `${PLAN_LIMITS.organizador.maxNumbersPerRaffle} números por sorteo`,
    "Cobro por transferencia con comprobante por WhatsApp",
    "Perfil público de organizador",
  ],
  pro: [
    `Hasta ${PLAN_LIMITS.pro.maxActiveRaffles} sorteos activos a la vez`,
    `${PLAN_LIMITS.pro.maxNumbersPerRaffle.toLocaleString("es-AR")} números por sorteo`,
    "Invitá y ganá + landing promocional",
    "Analíticas y exportación a CSV",
  ],
  premium: [
    `Hasta ${PLAN_LIMITS.premium.maxActiveRaffles} sorteos activos a la vez`,
    `${PLAN_LIMITS.premium.maxNumbersPerRaffle.toLocaleString("es-AR")} números por sorteo`,
    "Analíticas avanzadas y exportación a CSV",
    "Mercado Pago y sorteo automático",
    "Todo lo del plan Pro",
  ],
  social: [
    `Hasta ${PLAN_LIMITS.social.maxActiveRaffles} sorteos activos a la vez`,
    `${PLAN_LIMITS.social.maxNumbersPerRaffle.toLocaleString("es-AR")} números por sorteo`,
    "Invitá y ganá + landing promocional",
    "Precio solidario para ONG",
  ],
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
  return value === "premium" || value === "pro" || value === "social" || value === "free"
    ? value
    : "organizador";
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

/**
 * ¿Puede configurar esta cantidad de premios?
 *
 * Espeja `enforce_raffle_rules` (0059): 1..30 siempre, y además el tope del plan
 * (organizador 3, premium 30). El superadmin no tiene tope distinto de 30.
 */
export function canUsePrizes(context: PlanContext, prizes: number): boolean {
  if (!Number.isInteger(prizes) || prizes < 1 || prizes > 30) return false;
  return context.isSuperadmin || prizes <= context.limits.maxPrizesPerRaffle;
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
