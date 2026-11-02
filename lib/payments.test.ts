import { describe, expect, it } from "vitest";

import {
  computeAmount,
  isTerminalPaymentStatus,
  mapMpFailureStatus,
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
