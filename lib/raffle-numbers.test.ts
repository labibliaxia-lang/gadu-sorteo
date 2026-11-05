import { describe, expect, it, vi } from "vitest";

import { collectSoldNumbers } from "@/lib/raffle-numbers";

/** Fábrica de páginas: devuelve `total` números repartidos de a `pageSize`. */
function fakePages(total: number) {
  return vi.fn(async (from: number, to: number) => {
    const start = from + 1;
    const end = Math.min(to + 1, total);
    const data =
      from >= total
        ? []
        : Array.from({ length: end - start + 1 }, (_, i) => ({ number: start + i }));
    return { data, error: null };
  });
}

describe("collectSoldNumbers", () => {
  it("devuelve el listado cuando entra en una sola página", async () => {
    const fetchPage = fakePages(3);
    const numbers = await collectSoldNumbers(fetchPage, { pageSize: 1000 });

    expect(numbers).toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("pagina hasta el final cuando el listado supera el tamaño de página", async () => {
    // 2500 números con páginas de 1000: 3 pedidos (1000 + 1000 + 500).
    const fetchPage = fakePages(2500);
    const numbers = await collectSoldNumbers(fetchPage, { pageSize: 1000 });

    expect(numbers).toHaveLength(2500);
    expect(numbers[0]).toBe(1);
    expect(numbers[2499]).toBe(2500);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("no pierde números por el corte de max_rows de PostgREST", async () => {
    // Caso real del hallazgo: 1000 filas visibles de 4200 vendidas.
    const fetchPage = fakePages(4200);
    const numbers = await collectSoldNumbers(fetchPage, { pageSize: 1000 });

    expect(numbers).toHaveLength(4200);
    expect(new Set(numbers).size).toBe(4200);
  });

  it("respeta el tope máximo aunque haya más filas", async () => {
    const fetchPage = fakePages(5000);
    const numbers = await collectSoldNumbers(fetchPage, {
      pageSize: 1000,
      max: 2500,
    });

    expect(numbers).toHaveLength(2500);
    expect(numbers[2499]).toBe(2500);
  });

  it("corta ante un error en vez de devolver una lista parcial como completa", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ number: 1 }], error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("sin permisos") });

    const numbers = await collectSoldNumbers(fetchPage, { pageSize: 1 });

    // Con pageSize 1 la primera página vino completa, así que pidió la segunda
    // y el error cortó el bucle.
    expect(numbers).toEqual([1]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("devuelve vacío cuando no hay números vendidos", async () => {
    const numbers = await collectSoldNumbers(fakePages(0), { pageSize: 1000 });
    expect(numbers).toEqual([]);
  });
});
