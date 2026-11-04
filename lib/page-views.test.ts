import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  TRACK_VISIT_ENDPOINT,
  buildDailySeries,
  normalizeTrackedPath,
} from "@/lib/page-views";

const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const UUID_UPPER = UUID.toUpperCase();

/** 2026-03-10 02:30 UTC = 2026-03-09 23:30 en Argentina (UTC-3). */
const NOW = new Date("2026-03-10T02:30:00.000Z");

describe("normalizeTrackedPath", () => {
  it("acepta la home con y sin query, hash o espacios", () => {
    expect(normalizeTrackedPath("/")).toBe("/");
    expect(normalizeTrackedPath("  /  ")).toBe("/");
    expect(normalizeTrackedPath("/?utm_source=instagram")).toBe("/");
    expect(normalizeTrackedPath("/#sorteos")).toBe("/");
  });

  it("acepta la página de un sorteo y devuelve el path canónico", () => {
    expect(normalizeTrackedPath(`/sorteos/${UUID}`)).toBe(`/sorteos/${UUID}`);
  });

  it("normaliza la barra final y la query/hash de un sorteo", () => {
    expect(normalizeTrackedPath(`/sorteos/${UUID}/`)).toBe(`/sorteos/${UUID}`);
    expect(normalizeTrackedPath(`/sorteos/${UUID}?ref=wa#numeros`)).toBe(
      `/sorteos/${UUID}`,
    );
  });

  it("pasa el uuid a minúsculas", () => {
    expect(normalizeTrackedPath(`/sorteos/${UUID_UPPER}`)).toBe(
      `/sorteos/${UUID}`,
    );
  });

  it("rechaza path traversal", () => {
    expect(normalizeTrackedPath("/sorteos/../../x")).toBeNull();
    expect(normalizeTrackedPath("/sorteos/../admin")).toBeNull();
    expect(normalizeTrackedPath(`/sorteos/..%2F..%2F${UUID}`)).toBeNull();
    expect(normalizeTrackedPath(`/../sorteos/${UUID}`)).toBeNull();
  });

  it("rechaza rutas fuera del contrato", () => {
    const rejected = [
      "/admin",
      "/admin/super",
      "/sorteos",
      "/sorteos/123",
      `/sorteos/${UUID}/verificar`,
      `/sorteos/${UUID}/en-vivo`,
      `/organizador/${UUID}`,
      `/Sorteos/${UUID}`,
      "https://evil.example/sorteos/" + UUID,
      `sorteos/${UUID}`,
    ];

    for (const input of rejected) {
      expect(normalizeTrackedPath(input), input).toBeNull();
    }
  });

  it("rechaza basura y entradas que no son string", () => {
    const inputs: unknown[] = [
      null,
      undefined,
      42,
      true,
      {},
      [],
      ["/"],
      "",
      "   ",
      "not-a-path",
      "javascript:alert(1)",
    ];

    for (const input of inputs) {
      expect(normalizeTrackedPath(input)).toBeNull();
    }
  });
});

describe("buildDailySeries", () => {
  it("genera 30 días ascendentes e inclusive hoy, con 0 en los vacíos", () => {
    const series = buildDailySeries([], 30, NOW);

    expect(series).toHaveLength(30);
    expect(series[0]).toEqual({ day: "2026-02-08", views: 0, visitors: 0 });
    expect(series[29]).toEqual({ day: "2026-03-09", views: 0, visitors: 0 });

    for (let index = 1; index < series.length; index += 1) {
      expect(series[index - 1].day < series[index].day, "orden ascendente").toBe(
        true,
      );
    }
  });

  it("toma el día de Argentina, no el del servidor (UTC)", () => {
    // En UTC ya es 10 de marzo; en Argentina todavía es 9.
    expect(buildDailySeries([], 1, NOW)[0].day).toBe("2026-03-09");

    // 03:00 UTC es medianoche en Argentina: el día ya cambió a 10.
    expect(
      buildDailySeries([], 1, new Date("2026-03-10T03:00:00.000Z"))[0].day,
    ).toBe("2026-03-10");
  });

  it("ubica cada fila en su día y deja el resto en 0", () => {
    const series = buildDailySeries(
      [
        { day: "2026-03-09", views: 12, visitors: 7 },
        { day: "2026-03-03", views: "4", visitors: "2" },
      ],
      7,
      NOW,
    );

    expect(series).toHaveLength(7);
    expect(series[0]).toEqual({ day: "2026-03-03", views: 4, visitors: 2 });
    expect(series[6]).toEqual({ day: "2026-03-09", views: 12, visitors: 7 });
    expect(series[3]).toEqual({ day: "2026-03-06", views: 0, visitors: 0 });
  });

  it("usa 0 visitantes cuando la fila no los trae", () => {
    const series = buildDailySeries([{ day: "2026-03-09", views: 5 }], 1, NOW);
    expect(series[0]).toEqual({
      day: "2026-03-09",
      views: 5,
      visitors: 0,
    });
  });

  it("ignora días inválidos o fuera de la ventana", () => {
    const series = buildDailySeries(
      [
        { day: "no-es-fecha", views: 100, visitors: 50 },
        { day: "2026-03-99", views: 100 },
        { day: "2020-01-01", views: 100 },
        { day: "2026-03-10", views: 100 },
        { day: "", views: 100 },
      ],
      7,
      NOW,
    );

    expect(series.reduce((sum, point) => sum + point.views, 0)).toBe(0);
    expect(series.reduce((sum, point) => sum + point.visitors, 0)).toBe(0);
  });

  it("suma filas repetidas del mismo día", () => {
    const series = buildDailySeries(
      [
        { day: "2026-03-09", views: 2, visitors: 1 },
        { day: "2026-03-09", views: 3, visitors: 2 },
      ],
      1,
      NOW,
    );

    expect(series[0]).toEqual({ day: "2026-03-09", views: 5, visitors: 3 });
  });

  it("devuelve una serie vacía para cantidades inválidas", () => {
    expect(buildDailySeries([], 0, NOW)).toEqual([]);
    expect(buildDailySeries([], -3, NOW)).toEqual([]);
    expect(buildDailySeries([], Number.NaN, NOW)).toEqual([]);
  });
});

describe("contrato del módulo", () => {
  it("apunta al endpoint del route handler", () => {
    expect(TRACK_VISIT_ENDPOINT).toBe("/api/track-visit");
  });

  it("es un módulo puro: no importa next/headers ni Supabase", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./page-views.ts", import.meta.url)),
      "utf8",
    );

    // Se miran los imports reales, no los comentarios que nombran esos módulos.
    expect(source).not.toMatch(/from\s+["']next\/headers["']/);
    expect(source).not.toMatch(/from\s+["'][^"']*supabase[^"']*["']/i);
  });
});
