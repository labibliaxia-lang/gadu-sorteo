import { describe, expect, it } from "vitest";

import {
  amountMatches,
  computeAmount,
  isReversalStatus,
  isTerminalPaymentStatus,
  mapMpFailureStatus,
  sameNumberSet,
} from "./payments";

describe("computeAmount", () => {
  it("multiplica el precio por la cantidad de números", () => {
    expect(computeAmount(1, 500)).toBe(500);
    expect(computeAmount(4, 500)).toBe(2000);
  });

  it("acepta el precio como string, que es como llega desde Postgres", () => {
    expect(computeAmount(2, "1500.50")).toBe(3001);
  });

  it("redondea a centavos sin arrastrar decimales binarios", () => {
    // 3 * 0.1 no es 0.30000000000000004 en un importe.
    expect(computeAmount(3, 0.1)).toBe(0.3);
    expect(computeAmount(7, 133.33)).toBe(933.31);
  });

  it("devuelve 0 cuando no hay números", () => {
    expect(computeAmount(0, 500)).toBe(0);
  });
});

describe("isTerminalPaymentStatus", () => {
  it("reconoce los estados cerrados", () => {
    for (const status of [
      "approved",
      "rejected",
      "cancelled",
      "refunded",
      "charged_back",
      "expired",
    ]) {
      expect(isTerminalPaymentStatus(status)).toBe(true);
    }
  });

  it("no cierra los estados en curso", () => {
    for (const status of ["pending", "in_process", "authorized"]) {
      expect(isTerminalPaymentStatus(status)).toBe(false);
    }
  });
});

describe("mapMpFailureStatus", () => {
  it("marca como rejected lo que no se cobró o se devolvió", () => {
    expect(mapMpFailureStatus("rejected")).toBe("rejected");
    expect(mapMpFailureStatus("refunded")).toBe("rejected");
    expect(mapMpFailureStatus("charged_back")).toBe("rejected");
  });

  it("marca como cancelled la cancelación", () => {
    expect(mapMpFailureStatus("cancelled")).toBe("cancelled");
  });

  it("no libera nada mientras el pago está en curso o aprobado", () => {
    expect(mapMpFailureStatus("approved")).toBeNull();
    expect(mapMpFailureStatus("pending")).toBeNull();
    expect(mapMpFailureStatus("in_process")).toBeNull();
    expect(mapMpFailureStatus("authorized")).toBeNull();
    expect(mapMpFailureStatus("in_mediation")).toBeNull();
  });
});

describe("sameNumberSet", () => {
  it("reconoce el mismo carrito sin importar el orden", () => {
    expect(sameNumberSet([1, 2, 3], [3, 1, 2])).toBe(true);
    expect(sameNumberSet([7], [7])).toBe(true);
  });

  it("distingue carritos distintos", () => {
    expect(sameNumberSet([1, 2], [1, 3])).toBe(false);
    expect(sameNumberSet([1, 2], [1, 2, 3])).toBe(false);
    expect(sameNumberSet([1, 2, 3], [1, 2])).toBe(false);
  });

  it("no confunde un duplicado con un conjunto", () => {
    // Si el array trae repetidos, no representa un carrito valido.
    expect(sameNumberSet([4, 4], [4, 4])).toBe(false);
    expect(sameNumberSet([4, 4], [4])).toBe(false);
  });

  it("trata valores no numericos como no coincidentes", () => {
    expect(sameNumberSet([Number.NaN], [Number.NaN])).toBe(false);
  });

  it("acepta listas vacias como iguales", () => {
    expect(sameNumberSet([], [])).toBe(true);
  });
});

describe("isReversalStatus", () => {
  it("reconoce devolucion y contracargo", () => {
    expect(isReversalStatus("refunded")).toBe(true);
    expect(isReversalStatus("charged_back")).toBe(true);
  });

  it("no confunde un pago aprobado con una reversa", () => {
    expect(isReversalStatus("approved")).toBe(false);
    expect(isReversalStatus("pending")).toBe(false);
    expect(isReversalStatus("in_process")).toBe(false);
    expect(isReversalStatus("rejected")).toBe(false);
    expect(isReversalStatus("cancelled")).toBe(false);
  });
});


describe("amountMatches", () => {
  it("acepta el importe exacto, venga como numero o como string", () => {
    expect(amountMatches(2000, 2000)).toBe(true);
    expect(amountMatches("2000.00", 2000)).toBe(true);
    expect(amountMatches("1500.50", 1500.5)).toBe(true);
  });

  it("tolera un centavo de redondeo", () => {
    expect(amountMatches(1000, 1000.01)).toBe(true);
  });

  it("rechaza un cobro menor al registrado", () => {
    expect(amountMatches(2000, 1999)).toBe(false);
    expect(amountMatches(2000, 1)).toBe(false);
  });

  it("rechaza un cobro mayor al registrado", () => {
    expect(amountMatches(2000, 2500)).toBe(false);
  });

  it("no aprueba nada sin dato de importe", () => {
    expect(amountMatches(2000, null)).toBe(false);
    expect(amountMatches(2000, undefined)).toBe(false);
    expect(amountMatches(2000, Number.NaN)).toBe(false);
  });
});

