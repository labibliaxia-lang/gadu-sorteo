import { describe, expect, it } from "vitest";

import {
  locateNumber,
  normalizeJumpInput,
  parseJumpNumber,
} from "./jump-number";

describe("normalizeJumpInput", () => {
  it("deja sólo dígitos", () => {
    expect(normalizeJumpInput(" 01-50 ", 5)).toBe("0150");
  });

  it("limita a la cantidad de cifras del sorteo", () => {
    expect(normalizeJumpInput("123456", 5)).toBe("12345");
  });
});

describe("parseJumpNumber", () => {
  it("acepta ceros a la izquierda", () => {
    expect(parseJumpNumber("0150", 10000)).toBe(150);
  });

  it("acepta el número tal cual", () => {
    expect(parseJumpNumber("150", 10000)).toBe(150);
  });

  it("rechaza fuera de rango", () => {
    expect(parseJumpNumber("0", 10000)).toBeNull();
    expect(parseJumpNumber("10001", 10000)).toBeNull();
  });

  it("rechaza texto vacío o sin dígitos", () => {
    expect(parseJumpNumber("", 10000)).toBeNull();
    expect(parseJumpNumber("abc", 10000)).toBeNull();
  });

  it("ignora separadores y decimales escritos por error", () => {
    expect(parseJumpNumber("1.5", 10000)).toBe(15);
  });
});

describe("locateNumber", () => {
  const pageSize = 120;
  const cols = 20; // 6 filas por página

  it("ubica el primero de la página", () => {
    expect(locateNumber(1, 10000, pageSize, cols)).toEqual({ page: 0, row: 0 });
  });

  it("ubica el último de la primera página", () => {
    expect(locateNumber(120, 10000, pageSize, cols)).toEqual({
      page: 0,
      row: 5,
    });
  });

  it("pasa a la página siguiente", () => {
    expect(locateNumber(121, 10000, pageSize, cols)).toEqual({
      page: 1,
      row: 0,
    });
  });

  it("ubica un número del medio", () => {
    // 150: índice 149; página 1 (120..239); fila 1 (20..39 dentro de la página).
    expect(locateNumber(150, 10000, pageSize, cols)).toEqual({
      page: 1,
      row: 1,
    });
  });

  it("rechaza fuera de rango", () => {
    expect(locateNumber(0, 10000, pageSize, cols)).toBeNull();
    expect(locateNumber(10001, 10000, pageSize, cols)).toBeNull();
  });
});
