import { describe, expect, it } from "vitest";

import { evaluateAdminMfaGate } from "@/lib/mfa";

describe("evaluateAdminMfaGate", () => {
  it("deja pasar todo si el flag está apagado", () => {
    expect(
      evaluateAdminMfaGate({
        required: false,
        currentLevel: "aal1",
        nextLevel: "aal1",
      }),
    ).toBe("ok");
    expect(
      evaluateAdminMfaGate({
        required: false,
        currentLevel: null,
        nextLevel: null,
      }),
    ).toBe("ok");
  });

  it("deja pasar una sesión que ya verificó el factor", () => {
    expect(
      evaluateAdminMfaGate({
        required: true,
        currentLevel: "aal2",
        nextLevel: "aal2",
      }),
    ).toBe("ok");
  });

  it("manda a enrolar cuando no hay ningún factor verificado", () => {
    expect(
      evaluateAdminMfaGate({
        required: true,
        currentLevel: "aal1",
        nextLevel: "aal1",
      }),
    ).toBe("enroll");
  });

  it("manda a verificar cuando el factor existe pero la sesión es aal1", () => {
    expect(
      evaluateAdminMfaGate({
        required: true,
        currentLevel: "aal1",
        nextLevel: "aal2",
      }),
    ).toBe("verify");
  });

  it("trata los niveles ausentes como sesión sin factor", () => {
    expect(
      evaluateAdminMfaGate({
        required: true,
        currentLevel: undefined,
        nextLevel: null,
      }),
    ).toBe("enroll");
  });
});
