import { describe, expect, it } from "vitest";

import { canUsePrizes, getPlanContext, PLAN_LIMITS } from "./plans";

/**
 * Los topes de premios tienen que espejar `enforce_raffle_rules` (0059:33-52).
 * Si `lib/plans.ts` y la base se separan, el organizador configura premios que
 * la base le va a rechazar al final del wizard — el mismo patrón que dejaba
 * pasar el wizard con 4 de 9 datos de KYC.
 */

const organizador = getPlanContext({ plan: "organizador", role: "admin" });
const premium = getPlanContext({ plan: "premium", role: "admin" });
const superadmin = getPlanContext({ plan: "organizador", role: "superadmin" });

describe("límite de premios por plan", () => {
  it("replica los números de la base", () => {
    expect(PLAN_LIMITS.organizador.maxPrizesPerRaffle).toBe(3);
    expect(PLAN_LIMITS.premium.maxPrizesPerRaffle).toBe(30);
  });

  it("el organizador llega a 3 y no a 4", () => {
    expect(canUsePrizes(organizador, 1)).toBe(true);
    expect(canUsePrizes(organizador, 3)).toBe(true);
    expect(canUsePrizes(organizador, 4)).toBe(false);
  });

  it("premium y superadmin llegan a 30", () => {
    expect(canUsePrizes(premium, 30)).toBe(true);
    expect(canUsePrizes(superadmin, 30)).toBe(true);
  });

  it("el superadmin no hereda el tope del plan del dueño", () => {
    // 0059:33-34 y 0059:40-41 exceptúan al superadmin.
    expect(canUsePrizes(superadmin, 10)).toBe(true);
  });

  it("nadie pasa de 30: es el techo absoluto de la base", () => {
    expect(canUsePrizes(premium, 31)).toBe(false);
    expect(canUsePrizes(superadmin, 31)).toBe(false);
  });

  it("rechaza cero, negativos y decimales", () => {
    expect(canUsePrizes(premium, 0)).toBe(false);
    expect(canUsePrizes(premium, -1)).toBe(false);
    expect(canUsePrizes(premium, 2.5)).toBe(false);
  });
});
