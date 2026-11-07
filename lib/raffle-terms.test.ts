import { describe, expect, it } from "vitest";

import { generarBasesLegales } from "@/lib/raffle-terms";

const base = {
  organizerName: "Jacinto Pérez",
  organizerDoc: "20123456789",
  raffleTitle: "Sorteo de prueba",
  drawDateLabel: "10/11/2026 20:00",
  priceLabel: "1000 ARS",
  numbersCount: 500,
  transferAlias: "gadu.mp",
  transferCbu: null,
  transferBank: "Banco Nación",
  whatsapp: "5491123456789",
};

describe("generarBasesLegales", () => {
  it("incluye los datos de KYC del organizador", () => {
    const texto = generarBasesLegales(base);
    expect(texto).toContain("Jacinto Pérez");
    expect(texto).toContain("20123456789");
  });

  it("incluye el premio, la fecha y el precio", () => {
    const texto = generarBasesLegales(base);
    expect(texto).toContain("Sorteo de prueba");
    expect(texto).toContain("10/11/2026 20:00");
    expect(texto).toContain("1000 ARS");
    expect(texto).toContain("500");
  });

  it("deja explícita la devolución del 100% y la verificación", () => {
    const texto = generarBasesLegales(base);
    expect(texto).toContain("100%");
    expect(texto.toLowerCase()).toContain("hash");
    expect(texto.toLowerCase()).toContain("verificable");
  });

  it("incluye los datos de pago cuando existen", () => {
    const texto = generarBasesLegales(base);
    expect(texto).toContain("gadu.mp");
    expect(texto).toContain("Banco Nación");
    expect(texto).not.toContain("CBU:");
  });

  it("usa un fallback si falta el documento", () => {
    const texto = generarBasesLegales({ ...base, organizerDoc: null });
    expect(texto).toContain("no informado");
  });

  it("limpia caracteres de control del nombre", () => {
    const texto = generarBasesLegales({
      ...base,
      organizerName: "Nombre\u0000Con\u0007Control",
    });
    expect(texto).not.toContain("\u0000");
    expect(texto).not.toContain("\u0007");
    expect(texto).toContain("Nombre Con Control");
  });

  it("recorta nombres absurdamente largos", () => {
    const texto = generarBasesLegales({
      ...base,
      organizerName: "A".repeat(5000),
    });
    expect(texto.length).toBeLessThan(8000);
    expect(texto).toContain("A".repeat(120));
    expect(texto).not.toContain("A".repeat(121));
  });

  it("no interpreta HTML: el texto queda literal", () => {
    const texto = generarBasesLegales({
      ...base,
      organizerName: "<script>alert(1)</script>",
    });
    expect(texto).toContain("<script>alert(1)</script>");
    expect(texto).not.toContain("<b>");
  });
});
