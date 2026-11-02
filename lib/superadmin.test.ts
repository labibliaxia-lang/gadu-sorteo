import { describe, expect, it } from "vitest";

import {
  ASSIGNABLE_ROLES,
  canDemoteSuperadmin,
  licenseBenefit,
  normalizeParam,
  pickAllowed,
  roleLabel,
  waLink,
} from "./superadmin";

describe("canDemoteSuperadmin", () => {
  it("rechaza degradar al último superadmin", () => {
    expect(canDemoteSuperadmin(1)).toBe(false);
  });

  it("rechaza también cuando no queda ninguno (dato inconsistente)", () => {
    expect(canDemoteSuperadmin(0)).toBe(false);
  });

  it("falla cerrado cuando el conteo no se pudo obtener", () => {
    expect(canDemoteSuperadmin(null)).toBe(false);
  });

  it("permite degradar cuando queda otro superadmin", () => {
    expect(canDemoteSuperadmin(2)).toBe(true);
    expect(canDemoteSuperadmin(7)).toBe(true);
  });
});

describe("licenseBenefit", () => {
  it("una licencia premium revierte el plan", () => {
    expect(licenseBenefit("premium")).toEqual({
      field: "plan",
      from: "premium",
      to: "organizador",
    });
  });

  it("una licencia de organizador revierte el rol", () => {
    expect(licenseBenefit("organizador")).toEqual({
      field: "role",
      from: "admin",
      to: "user",
    });
  });

  it("normaliza mayúsculas y espacios", () => {
    expect(licenseBenefit("  PREMIUM ")).not.toBeNull();
  });

  it("con un plan desconocido devuelve null: no se adivina qué revertir", () => {
    expect(licenseBenefit("vip")).toBeNull();
    expect(licenseBenefit("")).toBeNull();
  });

  it("el rol revierte admin -> user, nunca superadmin", () => {
    const benefit = licenseBenefit("organizador");
    expect(benefit?.field).toBe("role");
    expect(benefit?.from).toBe("admin");
    expect(benefit?.to).toBe("user");
  });
});

describe("pickAllowed", () => {
  it("devuelve el valor cuando está permitido", () => {
    expect(pickAllowed("admin", ASSIGNABLE_ROLES, "user")).toBe("admin");
  });

  it("cae al fallback con un valor inventado o ausente", () => {
    expect(pickAllowed("root", ASSIGNABLE_ROLES, "user")).toBe("user");
    expect(pickAllowed(undefined, ASSIGNABLE_ROLES, "user")).toBe("user");
    expect(pickAllowed(42, ASSIGNABLE_ROLES, "user")).toBe("user");
  });
});

describe("normalizeParam", () => {
  it("acepta string y primer elemento de un array", () => {
    expect(normalizeParam("  hola ")).toBe("hola");
    expect(normalizeParam(["uno", "dos"])).toBe("uno");
  });

  it("descarta vacíos y tipos que no son texto", () => {
    expect(normalizeParam("")).toBeUndefined();
    expect(normalizeParam("   ")).toBeUndefined();
    expect(normalizeParam([])).toBeUndefined();
    expect(normalizeParam(null)).toBeUndefined();
  });
});

describe("roleLabel", () => {
  it("traduce los tres roles del sistema", () => {
    expect(roleLabel("superadmin")).toBe("Superadmin");
    expect(roleLabel("admin")).toBe("Organizador");
    expect(roleLabel("user")).toBe("Usuario");
    expect(roleLabel("cualquier-cosa")).toBe("Usuario");
  });
});

describe("waLink", () => {
  it("arma el enlace argentino quitando 0 y 15 de móvil", () => {
    expect(waLink("011 15-2345-6789")).toBe("https://wa.me/5491123456789");
    expect(waLink("+54 9 11 2345-6789")).toBe("https://wa.me/5491123456789");
  });

  it("respeta un número internacional de otro país", () => {
    expect(waLink("+1 555 123 4567")).toBe("https://wa.me/15551234567");
  });

  it("devuelve null cuando no hay número usable", () => {
    expect(waLink(null)).toBeNull();
    expect(waLink("")).toBeNull();
    expect(waLink("123")).toBeNull();
  });
});
