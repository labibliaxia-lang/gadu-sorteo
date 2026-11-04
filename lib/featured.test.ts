import { describe, expect, it } from "vitest";

import { canFeature, pickFeatured, sortFeaturedFirst } from "./featured";

type Row = {
  id: string;
  status: string;
  is_featured?: boolean | null;
  featured_at?: string | null;
};

const row = (partial: Partial<Row> & { id: string }): Row => ({
  status: "active",
  is_featured: false,
  featured_at: null,
  ...partial,
});

describe("canFeature", () => {
  it("solo un sorteo activo puede destacarse", () => {
    expect(canFeature("active")).toBe(true);
    expect(canFeature("closed")).toBe(false);
    expect(canFeature("drawn")).toBe(false);
    expect(canFeature("cancelled")).toBe(false);
  });
});

describe("pickFeatured", () => {
  it("devuelve null sin sorteos", () => {
    expect(pickFeatured([])).toBeNull();
  });

  it("elige el destacado activo más reciente por featured_at", () => {
    const picked = pickFeatured([
      row({ id: "viejo", is_featured: true, featured_at: "2026-11-01T10:00:00Z" }),
      row({ id: "nuevo", is_featured: true, featured_at: "2026-11-04T10:00:00Z" }),
    ]);
    expect(picked?.id).toBe("nuevo");
  });

  it("ignora un destacado que no está activo", () => {
    const picked = pickFeatured([
      row({ id: "cerrado", status: "closed", is_featured: true, featured_at: "2026-11-04T10:00:00Z" }),
      row({ id: "activo", is_featured: true, featured_at: "2026-11-01T10:00:00Z" }),
    ]);
    expect(picked?.id).toBe("activo");
  });

  it("sin destacados cae al primer activo", () => {
    const picked = pickFeatured([
      row({ id: "sorteado", status: "drawn" }),
      row({ id: "primero-activo" }),
      row({ id: "segundo-activo" }),
    ]);
    expect(picked?.id).toBe("primero-activo");
  });

  it("sin activos cae al primero de la lista", () => {
    const picked = pickFeatured([
      row({ id: "sorteado", status: "drawn" }),
      row({ id: "cancelado", status: "cancelled" }),
    ]);
    expect(picked?.id).toBe("sorteado");
  });
});

describe("sortFeaturedFirst", () => {
  it("pone los destacados activos primero y conserva el resto", () => {
    const sorted = sortFeaturedFirst([
      row({ id: "a" }),
      row({ id: "destacado", is_featured: true, featured_at: "2026-11-04T10:00:00Z" }),
      row({ id: "b" }),
      row({ id: "destacado-inactivo", status: "closed", is_featured: true }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual([
      "destacado",
      "a",
      "b",
      "destacado-inactivo",
    ]);
  });

  it("no muta el array original", () => {
    const original = [row({ id: "a" }), row({ id: "destacado", is_featured: true })];
    sortFeaturedFirst(original);
    expect(original.map((r) => r.id)).toEqual(["a", "destacado"]);
  });
});
