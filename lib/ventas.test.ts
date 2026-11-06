import { describe, expect, it } from "vitest";

import {
  agruparVentas,
  csvDeVentas,
  resumirVentas,
  SIN_COMPRADOR,
  type Comprador,
  type NumeroVendido,
} from "./ventas";

/**
 * Planilla de ventas: agrupación por comprador, totales y CSV.
 *
 * El caso que importa de verdad es el de los números vendidos SIN dueño: pasan
 * cuando el organizador marca un número a mano y no hay reserva previa. Esos no
 * se pueden perder en el camino, tienen que quedar en la planilla con su propia
 * fila.
 */

const COMPRADORES: Comprador[] = [
  { buyer_id: "b-ana", full_name: "Ana Ficticia", phone: "+5491155550101" },
  { buyer_id: "b-bruno", full_name: "Bruno Ficticio", phone: null },
];

const VENDIDOS: NumeroVendido[] = [
  { number: 17, sold_to: "b-ana", sold_at: "2026-11-06T03:00:00Z" },
  { number: 3, sold_to: "b-ana", sold_at: "2026-11-06T02:00:00Z" },
  { number: 101, sold_to: "b-bruno", sold_at: "2026-11-06T04:00:00Z" },
  { number: 500, sold_to: null, sold_at: "2026-11-06T05:00:00Z" },
];

describe("agruparVentas", () => {
  const filas = agruparVentas(VENDIDOS, COMPRADORES, 1000);

  it("agrupa por comprador y ordena los números", () => {
    const ana = filas.find((f) => f.compradorId === "b-ana");
    expect(ana?.numeros).toEqual([3, 17]);
    expect(ana?.cantidad).toBe(2);
    expect(ana?.total).toBe(2000);
  });

  it("ordena por cantidad comprada, el que más compró primero", () => {
    expect(filas[0].compradorId).toBe("b-ana");
  });

  it("no pierde los números sin dueño", () => {
    const anonimo = filas.find((f) => f.compradorId === null);
    expect(anonimo?.nombre).toBe(SIN_COMPRADOR);
    expect(anonimo?.numeros).toEqual([500]);
  });

  it("calcula primera y última venta", () => {
    const ana = filas.find((f) => f.compradorId === "b-ana");
    expect(ana?.primeraVenta).toBe("2026-11-06T02:00:00Z");
    expect(ana?.ultimaVenta).toBe("2026-11-06T03:00:00Z");
  });

  it("si falta el contacto, no rompe: usa el id corto", () => {
    const soloId = agruparVentas([{ number: 1, sold_to: "b-desconocido", sold_at: null }], [], 500);
    expect(soloId[0].nombre).toBe("Comprador b-descon");
    expect(soloId[0].telefono).toBeNull();
  });

  it("sin ventas devuelve lista vacía", () => {
    expect(agruparVentas([], COMPRADORES, 1000)).toEqual([]);
  });
});

describe("resumirVentas", () => {
  it("cuenta compradores, números y recaudación", () => {
    const filas = agruparVentas(VENDIDOS, COMPRADORES, 1000);
    const resumen = resumirVentas(filas);

    expect(resumen.compradores).toBe(2);
    expect(resumen.numeros).toBe(4);
    expect(resumen.total).toBe(4000);
    expect(resumen.anonimos).toBe(1);
  });
});

describe("csvDeVentas", () => {
  const csv = csvDeVentas(agruparVentas(VENDIDOS, COMPRADORES, 1000), "Sorteo de prueba");

  it("arranca con BOM para que Excel respete los acentos", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("usa punto y coma como separador", () => {
    expect(csv.split("\r\n")[2]).toContain("Comprador;Teléfono;Cantidad");
  });

  it("incluye una fila por comprador con sus números", () => {
    expect(csv).toContain("Ana Ficticia;+5491155550101;2;3 17;2000");
  });

  it("escapa comillas y separadores en los nombres", () => {
    const raro = agruparVentas(
      [{ number: 1, sold_to: "b-1", sold_at: null }],
      [{ buyer_id: "b-1", full_name: 'Ana "la jefa"; SRL', phone: null }],
      100,
    );
    const salida = csvDeVentas(raro, "x");
    expect(salida).toContain('"Ana ""la jefa""; SRL"');
  });
});
