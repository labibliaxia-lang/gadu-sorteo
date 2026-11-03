import { describe, expect, it } from "vitest";

import {
  addressMatches,
  composeDeliveryAddress,
  normalizeAddress,
} from "@/lib/address";

const profile = {
  address_line: "Av. Siempreviva 742",
  city: "Springfield",
  province: "Buenos Aires",
  postal_code: "1234",
  country: "AR",
};

describe("normalizeAddress", () => {
  it("ignora mayúsculas, acentos y espacios de más", () => {
    expect(normalizeAddress("  Av. CÓRDOBA 1234 ")).toBe("av cordoba 1234");
  });

  it("ignora puntos y comas", () => {
    expect(normalizeAddress("Av. Siempreviva 742, Springfield")).toBe(
      "av siempreviva 742 springfield",
    );
  });
});

describe("composeDeliveryAddress", () => {
  it("arma la dirección completa en orden", () => {
    expect(composeDeliveryAddress(profile)).toBe(
      "Av. Siempreviva 742, Springfield, Buenos Aires, 1234, AR",
    );
  });

  it("omite partes vacías", () => {
    expect(
      composeDeliveryAddress({
        address_line: "Calle 1",
        city: "La Plata",
      }),
    ).toBe("Calle 1, La Plata");
  });
});

describe("addressMatches", () => {
  it("acepta la misma dirección con distinto formato", () => {
    expect(
      addressMatches(
        profile,
        "av. siempreviva 742, springfield, buenos aires, 1234, ar",
      ),
    ).toBe(true);
  });

  it("acepta la dirección sin el país", () => {
    expect(
      addressMatches(
        profile,
        "Av. Siempreviva 742, Springfield, Buenos Aires, 1234",
      ),
    ).toBe(true);
  });

  it("rechaza una dirección distinta", () => {
    expect(
      addressMatches(profile, "Av. Siempreviva 742, Springfield, Córdoba"),
    ).toBe(false);
  });
});
