import { describe, expect, it } from "vitest";

import { TERMS_VERSION, termsCookieAccepted } from "@/lib/terms";

describe("termsCookieAccepted", () => {
  it("acepta el consentimiento ya registrado para la versión vigente", () => {
    expect(termsCookieAccepted(TERMS_VERSION)).toBe(true);
  });

  it("vuelve a pedir la aceptación cuando la cookie no existe", () => {
    expect(termsCookieAccepted(undefined)).toBe(false);
    expect(termsCookieAccepted(null)).toBe(false);
    expect(termsCookieAccepted("")).toBe(false);
  });

  it("vuelve a pedir la aceptación cuando la versión de la cookie quedó vieja", () => {
    expect(termsCookieAccepted("0.9")).toBe(false);
  });

  it("no acepta el formato anterior de la cookie (valor '1')", () => {
    // Antes la cookie era un flag binario; tras el cambio tiene que pasar una
    // vez más por el checklist y salir con la versión, no con '1'.
    expect(termsCookieAccepted("1")).toBe(false);
  });
});
