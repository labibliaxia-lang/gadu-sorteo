import { describe, expect, it } from "vitest";

import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_TTL_SECONDS,
  canImpersonateTarget,
  parseImpersonationOrigin,
  serializeImpersonationOrigin,
  type ImpersonationOrigin,
} from "./impersonation";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";

function validOrigin(): ImpersonationOrigin {
  return {
    adminId: ADMIN_ID,
    adminEmail: "admin@example.com",
    adminRefreshToken: "refresh-token-de-prueba",
    targetId: TARGET_ID,
    targetName: "Usuario Destino",
    startedAt: "2026-01-01T12:00:00.000Z",
  };
}

/** Payload válido como objeto plano, para romperlo campo por campo. */
function validPayload(): Record<string, unknown> {
  return JSON.parse(serializeImpersonationOrigin(validOrigin()));
}

describe("constantes de la cookie", () => {
  it("usa el nombre y el TTL del contrato", () => {
    expect(IMPERSONATION_COOKIE).toBe("gadu_impersonation");
    expect(IMPERSONATION_TTL_SECONDS).toBe(2 * 60 * 60);
  });
});

describe("serializeImpersonationOrigin / parseImpersonationOrigin", () => {
  it("hace round-trip exacto", () => {
    const origin = validOrigin();
    expect(parseImpersonationOrigin(serializeImpersonationOrigin(origin))).toEqual(
      origin,
    );
  });

  it("incluye la versión del formato y sólo los campos del contrato", () => {
    const extra = { ...validOrigin(), campoIntruso: "x" } as ImpersonationOrigin;
    const parsed = JSON.parse(serializeImpersonationOrigin(extra));
    expect(parsed.v).toBe(1);
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "adminEmail",
        "adminId",
        "adminRefreshToken",
        "startedAt",
        "targetId",
        "targetName",
        "v",
      ].sort(),
    );
  });

  it("acepta adminEmail null", () => {
    const origin = { ...validOrigin(), adminEmail: null };
    expect(
      parseImpersonationOrigin(serializeImpersonationOrigin(origin)),
    ).toEqual(origin);
  });

  it("devuelve null con valores ausentes o vacíos", () => {
    expect(parseImpersonationOrigin(null)).toBeNull();
    expect(parseImpersonationOrigin(undefined)).toBeNull();
    expect(parseImpersonationOrigin("")).toBeNull();
    expect(parseImpersonationOrigin("   ")).toBeNull();
  });

  it("devuelve null con JSON inválido y nunca lanza", () => {
    const invalidos = [
      "{",
      "no-es-json",
      "[]",
      "null",
      "123",
      '"un string"',
      "{v:1}",
      "\u0000\u0001",
    ];
    for (const raw of invalidos) {
      expect(() => parseImpersonationOrigin(raw)).not.toThrow();
      expect(parseImpersonationOrigin(raw)).toBeNull();
    }
  });

  it("descarta una versión desconocida o con tipo incorrecto", () => {
    const base = validPayload();
    expect(parseImpersonationOrigin(JSON.stringify({ ...base, v: 2 }))).toBeNull();
    expect(parseImpersonationOrigin(JSON.stringify({ ...base, v: "1" }))).toBeNull();
    const { v: _v, ...sinVersion } = base;
    expect(parseImpersonationOrigin(JSON.stringify(sinVersion))).toBeNull();
  });

  it("descarta payloads con campos faltantes (todos son obligatorios)", () => {
    const campos = [
      "adminId",
      "adminEmail",
      "adminRefreshToken",
      "targetId",
      "targetName",
      "startedAt",
    ];
    for (const campo of campos) {
      const payload = validPayload();
      delete payload[campo];
      expect(
        parseImpersonationOrigin(JSON.stringify(payload)),
        `debería rechazar sin ${campo}`,
      ).toBeNull();
    }
  });

  it("descarta payloads con tipos inválidos", () => {
    const casos: Record<string, unknown>[] = [
      { adminId: 42 },
      { adminId: "no-es-un-uuid" },
      { adminEmail: 42 },
      { adminRefreshToken: "" },
      { adminRefreshToken: 123 },
      { targetId: "no-es-un-uuid" },
      { targetId: null },
      { targetName: 7 },
      { targetName: "   " },
      { startedAt: "no-es-una-fecha" },
      { startedAt: 12345 },
    ];
    for (const caso of casos) {
      expect(
        parseImpersonationOrigin(JSON.stringify({ ...validPayload(), ...caso })),
        `debería rechazar ${JSON.stringify(caso)}`,
      ).toBeNull();
    }
  });

  it("descarta valores absurdamente largos", () => {
    const base = validPayload();
    expect(
      parseImpersonationOrigin(
        JSON.stringify({ ...base, targetName: "x".repeat(201) }),
      ),
    ).toBeNull();
    expect(
      parseImpersonationOrigin(
        JSON.stringify({ ...base, adminEmail: `${"a".repeat(320)}@x.com` }),
      ),
    ).toBeNull();
    expect(
      parseImpersonationOrigin(
        JSON.stringify({ ...base, adminRefreshToken: "t".repeat(4097) }),
      ),
    ).toBeNull();
  });

  it("descarta payloads que no son objetos", () => {
    expect(parseImpersonationOrigin(JSON.stringify([validPayload()]))).toBeNull();
    expect(parseImpersonationOrigin(JSON.stringify("texto"))).toBeNull();
  });
});

describe("canImpersonateTarget", () => {
  const normalUser = {
    id: TARGET_ID,
    role: "user",
    is_banned: false,
    email: "usuario@example.com",
  };

  it("permite impersonar a un usuario normal", () => {
    expect(canImpersonateTarget(normalUser, ADMIN_ID)).toEqual({ ok: true });
  });

  it("permite impersonar a un organizador (admin), que no es superadmin", () => {
    expect(
      canImpersonateTarget({ ...normalUser, role: "admin" }, ADMIN_ID),
    ).toEqual({ ok: true });
  });

  it("trata is_banned ausente o null como cuenta activa", () => {
    expect(
      canImpersonateTarget({ ...normalUser, is_banned: null }, ADMIN_ID),
    ).toEqual({ ok: true });
    const { is_banned: _b, ...sinCampo } = normalUser;
    expect(canImpersonateTarget(sinCampo, ADMIN_ID)).toEqual({ ok: true });
  });

  it("prohíbe impersonarse a sí mismo", () => {
    const result = canImpersonateTarget({ ...normalUser, id: ADMIN_ID }, ADMIN_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/propia/i);
  });

  it("prohíbe impersonar a otro superadmin", () => {
    const result = canImpersonateTarget(
      { ...normalUser, role: "superadmin" },
      ADMIN_ID,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/superadmin/i);
  });

  it("la regla de 'no a otro superadmin' gana sobre el resto de los datos", () => {
    const result = canImpersonateTarget(
      { id: TARGET_ID, role: "superadmin", is_banned: false, email: null },
      ADMIN_ID,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/superadmin/i);
  });

  it("prohíbe impersonar una cuenta suspendida", () => {
    const result = canImpersonateTarget(
      { ...normalUser, is_banned: true },
      ADMIN_ID,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/suspendida/i);
  });

  it("exige un email", () => {
    for (const email of [null, "", "   ", undefined]) {
      const result = canImpersonateTarget({ ...normalUser, email }, ADMIN_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/email/i);
    }
  });

  it("rechaza un id vacío", () => {
    expect(canImpersonateTarget({ ...normalUser, id: "" }, ADMIN_ID).ok).toBe(false);
  });
});
