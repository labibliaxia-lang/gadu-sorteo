import { describe, expect, it } from "vitest";

import {
  calcularConfianza,
  ETIQUETA_NIVEL,
  RESENAS_MINIMAS,
  type SenalesConfianza,
} from "./confianza";

/**
 * El semáforo de confianza. Lo que importa probar no es el número exacto sino
 * las reglas que no se negocian:
 *   · deuda o denuncias mandan sobre cualquier promedio de estrellas;
 *   · sin sorteos completados no hay verde, aunque haya reseñas;
 *   · un promedio alto no rescata a quien canceló mucho.
 */

const BASE: SenalesConfianza = {
  kycAprobado: true,
  cuentaDesde: "2026-01-01T00:00:00Z",
  sorteosSorteados: 3,
  sorteosCancelados: 0,
  sorteosActivos: 1,
  devolucionesPendientes: 0,
  denunciasAbiertas: 0,
  resenas: 5,
  promedioResenas: 4.6,
};

const AHORA = new Date("2026-11-06T00:00:00Z").getTime();

describe("reglas duras", () => {
  it("una devolución sin pagar lo manda a con problemas, aunque tenga 5 estrellas", () => {
    const r = calcularConfianza(
      { ...BASE, devolucionesPendientes: 2, resenas: 40, promedioResenas: 5 },
      AHORA,
    );

    expect(r.nivel).toBe("con-problemas");
    expect(r.puntaje).toBeLessThanOrEqual(25);
    expect(r.advertencia).toMatch(/devoluciones sin pagar/i);
    expect(r.motivos).toContain("2 devoluciones sin pagar");
  });

  it("una denuncia abierta también lo manda a con problemas", () => {
    const r = calcularConfianza({ ...BASE, denunciasAbiertas: 1 }, AHORA);

    expect(r.nivel).toBe("con-problemas");
    expect(r.advertencia).toMatch(/denuncias sin resolver/i);
  });

  it("sin sorteos completados no es confiable, aunque tenga reseñas", () => {
    const r = calcularConfianza(
      { ...BASE, sorteosSorteados: 0, resenas: 9, promedioResenas: 5 },
      AHORA,
    );

    expect(r.nivel).toBe("sin-historial");
    expect(r.puntaje).toBe(0);
    expect(r.advertencia).toMatch(/todavía no completó ningún sorteo/i);
  });

  it("un organizador con historial limpio no lleva advertencia", () => {
    expect(calcularConfianza(BASE, AHORA).advertencia).toBeNull();
  });
});

describe("puntaje", () => {
  it("más historial suma, pero se estanca", () => {
    const pocos = calcularConfianza({ ...BASE, sorteosSorteados: 1 }, AHORA).puntaje;
    const muchos = calcularConfianza({ ...BASE, sorteosSorteados: 20 }, AHORA).puntaje;

    expect(muchos).toBeGreaterThan(pocos);
    // El aporte por historia está topeado en 15: 20 sorteos no valen 60 puntos.
    expect(muchos - pocos).toBeLessThanOrEqual(15);
  });

  it("sin KYC pierde puntos", () => {
    const con = calcularConfianza(BASE, AHORA).puntaje;
    const sin = calcularConfianza({ ...BASE, kycAprobado: false }, AHORA).puntaje;

    expect(con - sin).toBe(20);
  });

  it("cancelar resta, con tope", () => {
    const limpio = calcularConfianza(BASE, AHORA).puntaje;
    const uno = calcularConfianza({ ...BASE, sorteosCancelados: 1 }, AHORA).puntaje;
    const muchos = calcularConfianza({ ...BASE, sorteosCancelados: 9 }, AHORA).puntaje;

    expect(uno).toBeLessThan(limpio);
    expect(limpio - muchos).toBeLessThanOrEqual(25);
  });

  it("el promedio de reseñas pesa, pero recién desde el mínimo", () => {
    const pocas = calcularConfianza({ ...BASE, resenas: RESENAS_MINIMAS - 1, promedioResenas: 1 }, AHORA);
    const suficientes = calcularConfianza({ ...BASE, resenas: RESENAS_MINIMAS, promedioResenas: 1 }, AHORA);

    // Con menos del mínimo el promedio se ignora: puntúa mejor que tener el
    // mínimo con un promedio pésimo.
    expect(pocas.puntaje).toBeGreaterThan(suficientes.puntaje);
    expect(pocas.motivos.some((m) => /sin peso/.test(m))).toBe(true);
    expect(suficientes.motivos.some((m) => /reseñas de compradores/.test(m))).toBe(true);
  });

  it("un promedio de 5 suma hasta 10 y uno de 1 resta hasta 10", () => {
    const cinco = calcularConfianza({ ...BASE, promedioResenas: 5 }, AHORA).puntaje;
    const tres = calcularConfianza({ ...BASE, promedioResenas: 3 }, AHORA).puntaje;
    const uno = calcularConfianza({ ...BASE, promedioResenas: 1 }, AHORA).puntaje;

    expect(cinco - tres).toBe(10);
    expect(tres - uno).toBe(10);
  });

  it("el puntaje nunca se sale de 0..100", () => {
    const perfecto = calcularConfianza(
      { ...BASE, sorteosSorteados: 50, resenas: 100, promedioResenas: 5 },
      AHORA,
    );
    const malo = calcularConfianza(
      { ...BASE, kycAprobado: false, sorteosSorteados: 1, sorteosCancelados: 50, resenas: 3, promedioResenas: 1 },
      AHORA,
    );

    expect(perfecto.puntaje).toBeLessThanOrEqual(100);
    expect(malo.puntaje).toBeGreaterThanOrEqual(0);
  });

  it("una cuenta nueva suma menos que una vieja", () => {
    const nueva = calcularConfianza(
      { ...BASE, cuentaDesde: "2026-11-01T00:00:00Z" },
      AHORA,
    ).puntaje;
    const vieja = calcularConfianza(
      { ...BASE, cuentaDesde: "2025-01-01T00:00:00Z" },
      AHORA,
    ).puntaje;

    expect(vieja - nueva).toBe(5);
  });
});

describe("motivos", () => {
  it("siempre explica el color, nunca es sólo un número", () => {
    const r = calcularConfianza(BASE, AHORA);

    expect(r.motivos.length).toBeGreaterThan(0);
    expect(r.motivos).toContain("Identidad verificada (DNI y selfie)");
    expect(r.motivos.some((m) => /3 sorteos completados/.test(m))).toBe(true);
  });

  it("hay etiqueta para los tres niveles", () => {
    expect(Object.keys(ETIQUETA_NIVEL)).toEqual(["sin-historial", "confiable", "con-problemas"]);
  });
});
