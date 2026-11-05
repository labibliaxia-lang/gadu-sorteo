import { describe, expect, it } from "vitest";

import { direccionEntregaCompleta, type DireccionEntrega } from "./direccion";

/**
 * Tiene que coincidir con `deliverySchema` (app/perfil/actions.ts), que es lo
 * que valida `saveDeliveryAddress` en el servidor. Si el cliente fuera más
 * laxo, el botón se habilitaría y la acción devolvería error; si fuera más
 * estricto, el comprador no podría guardar una dirección válida.
 */

const COMPLETA: DireccionEntrega = {
  phone: "+54 9 11 5555-0101",
  address_line: "Av. Siempreviva 742",
  city: "Buenos Aires",
  province: "CABA",
  postal_code: "1000",
  country: "AR",
};

describe("direccionEntregaCompleta", () => {
  it("una dirección completa pasa", () => {
    expect(direccionEntregaCompleta(COMPLETA)).toBe(true);
  });

  it("el teléfono se mide en dígitos, no en caracteres", () => {
    // "+54 9 1" tiene 12 caracteres pero sólo 4 dígitos: no alcanza.
    expect(direccionEntregaCompleta({ ...COMPLETA, phone: "+54 9 1" })).toBe(false);
    expect(direccionEntregaCompleta({ ...COMPLETA, phone: "+54 9 11 55" })).toBe(true);
    expect(direccionEntregaCompleta({ ...COMPLETA, phone: "+5491155550101" })).toBe(true);
  });

  it("exige cada campo con su mínimo", () => {
    expect(direccionEntregaCompleta({ ...COMPLETA, address_line: "Av" })).toBe(false);
    expect(direccionEntregaCompleta({ ...COMPLETA, city: "B" })).toBe(false);
    expect(direccionEntregaCompleta({ ...COMPLETA, province: "C" })).toBe(false);
    expect(direccionEntregaCompleta({ ...COMPLETA, postal_code: "10" })).toBe(false);
    expect(direccionEntregaCompleta({ ...COMPLETA, country: "A" })).toBe(false);
  });

  it("los espacios no cuentan", () => {
    expect(direccionEntregaCompleta({ ...COMPLETA, address_line: "    " })).toBe(false);
  });

  it("null y ausente son incompletos", () => {
    expect(direccionEntregaCompleta(null)).toBe(false);
    expect(direccionEntregaCompleta(undefined)).toBe(false);
    expect(direccionEntregaCompleta({ ...COMPLETA, city: null })).toBe(false);
  });
});
