import { describe, expect, it } from "vitest";

import {
  normalizarTelefonoAR,
  telefonoLegible,
  waHref,
  waLink,
} from "@/lib/whatsapp";

describe("normalizarTelefonoAR", () => {
  it("antepone 549 a un número nacional de 10 dígitos", () => {
    expect(normalizarTelefonoAR("3547469000")).toBe("5493547469000");
  });

  it("saca el 0 de larga distancia", () => {
    expect(normalizarTelefonoAR("0354 746 9000")).toBe("5493547469000");
  });

  it("saca el 15 intercalado después del área", () => {
    expect(normalizarTelefonoAR("0354 15 4690000")).toBe("5493544690000");
    expect(normalizarTelefonoAR("354 15 4690000")).toBe("5493544690000");
  });

  it("no inventa dígitos cuando el número queda incompleto", () => {
    // 354 15 469000 tiene 6 dígitos de abonado: no es un número válido.
    expect(normalizarTelefonoAR("0354 15 469000")).toBeNull();
  });

  it("respeta un número ya internacional", () => {
    expect(normalizarTelefonoAR("+54 9 354 746 9000")).toBe("5493547469000");
    expect(normalizarTelefonoAR("5493547469000")).toBe("5493547469000");
  });

  it("acepta 00 en lugar de +", () => {
    expect(normalizarTelefonoAR("0054 9 354 746 9000")).toBe("5493547469000");
  });

  it("descarta separadores y paréntesis", () => {
    expect(normalizarTelefonoAR("(354) 746-9000")).toBe("5493547469000");
  });

  it("devuelve null si no hay 10 dígitos útiles", () => {
    expect(normalizarTelefonoAR("")).toBeNull();
    expect(normalizarTelefonoAR(null)).toBeNull();
    expect(normalizarTelefonoAR("sin número")).toBeNull();
    expect(normalizarTelefonoAR("12345")).toBeNull();
  });

  it("no inventa dígitos si el número es demasiado largo", () => {
    expect(normalizarTelefonoAR("354746900011")).toBeNull();
  });
});

describe("waLink", () => {
  it("usa el destino normalizado", () => {
    expect(
      waLink("0354 15 4690000", "Hola").startsWith(
        "https://wa.me/5493544690000?text=",
      ),
    ).toBe(true);
  });

  it("sin teléfono válido abre el selector con el texto", () => {
    const href = waLink(null, "Hola");
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
  });
});

describe("waHref", () => {
  it("incluye nombre y cantidad de números", () => {
    const href = decodeURIComponent(waHref("3547469000", "Ana", [1, 2]));
    expect(href).toContain("Ana");
    expect(href).toContain("2 número(s)");
  });
});

describe("telefonoLegible", () => {
  it("muestra el número en formato argentino", () => {
    expect(telefonoLegible("3547469000")).toBe("+54 9 354 746-9000");
  });

  it("devuelve null si no se puede normalizar", () => {
    expect(telefonoLegible("123")).toBeNull();
  });
});
