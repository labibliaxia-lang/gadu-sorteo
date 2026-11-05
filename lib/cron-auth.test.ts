import { describe, expect, it } from "vitest";

import { evaluarCronAuth } from "./cron-auth";

/**
 * El bug que motivó esto: sin `CRON_SECRET`, el cron devolvía 401 y las reservas
 * vencidas no se liberaban nunca. El 401 hacía parecer que alguien estaba
 * golpeando la puerta, cuando en realidad faltaba una variable de entorno.
 */

const SECRETO = "s3cr3t-de-prueba";

describe("evaluarCronAuth", () => {
  it("deja pasar con el secreto correcto", () => {
    expect(evaluarCronAuth(SECRETO, `Bearer ${SECRETO}`)).toEqual({ ok: true });
  });

  it("sin CRON_SECRET devuelve 500, no 401", () => {
    // El caso que dejaba el inventario trabado en silencio.
    const r = evaluarCronAuth(undefined, "Bearer lo-que-sea");

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("no debería pasar");
    expect(r.status).toBe(500);
    expect(r.error).toMatch(/mal configurado/i);
    expect(r.detalle).toMatch(/CRON_SECRET/);
  });

  it("un CRON_SECRET vacío cuenta como no configurado", () => {
    const r = evaluarCronAuth("   ", `Bearer ${SECRETO}`);

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("no debería pasar");
    expect(r.status).toBe(500);
  });

  it("con el secreto configurado y un header distinto devuelve 401", () => {
    const r = evaluarCronAuth(SECRETO, "Bearer otro");

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("no debería pasar");
    expect(r.status).toBe(401);
    expect(r.error).toMatch(/no autorizado/i);
  });

  it("sin header también es 401 cuando el secreto existe", () => {
    const r = evaluarCronAuth(SECRETO, "");

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("no debería pasar");
    expect(r.status).toBe(401);
  });

  it("no acepta el secreto sin el prefijo Bearer", () => {
    const r = evaluarCronAuth(SECRETO, SECRETO);

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("no debería pasar");
    expect(r.status).toBe(401);
  });

  it("un header que empieza igual pero cambia al final sigue dando 401 (hallazgo #18)", () => {
    // Con `===` el corte temprano filtraba por tiempo cuántos bytes acertaba el
    // atacante. La comparación en tiempo constante no cambia el veredicto.
    const casi = `Bearer ${SECRETO.slice(0, -1)}X`;
    const r = evaluarCronAuth(SECRETO, casi);

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("no debería pasar");
    expect(r.status).toBe(401);
  });

  it("acepta un secreto con caracteres no ASCII sin romper la comparación", () => {
    const raro = "secreto-con-ñ-y-ácento-€";

    expect(evaluarCronAuth(raro, `Bearer ${raro}`)).toEqual({ ok: true });
    expect(evaluarCronAuth(raro, "Bearer otro")).toMatchObject({ ok: false, status: 401 });
  });
});
