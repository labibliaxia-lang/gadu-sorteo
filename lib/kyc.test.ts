import { describe, expect, it } from "vitest";

import {
  CAMPOS_KYC,
  datosPersonalesCompletos,
  datosPersonalesFaltantes,
  type DatosPersonalesKyc,
} from "./kyc";

/**
 * La regla de `lib/kyc.ts` tiene que ser la misma que `enforce_organizer_kyc`
 * (migración `0060:57-67`). Si alguien agrega un campo al trigger, acá falla.
 */

const COMPLETO: DatosPersonalesKyc = {
  full_name: "Ana Ficticia Pérez",
  phone: "+5491155550101",
  location: "CABA, Argentina",
  dni_number: "30123456",
  dni_address: "Av. Siempreviva 742, CABA",
  address_line: "Av. Siempreviva 742",
  city: "Buenos Aires",
  province: "CABA",
  postal_code: "1000",
};

describe("datos personales del KYC", () => {
  it("un perfil completo no tiene faltantes", () => {
    expect(datosPersonalesFaltantes(COMPLETO)).toEqual([]);
    expect(datosPersonalesCompletos(COMPLETO)).toBe(true);
  });

  it("exige los 9 campos del trigger 0060", () => {
    expect(CAMPOS_KYC).toHaveLength(9);
    expect(CAMPOS_KYC.map((c) => c.campo).sort()).toEqual(
      [
        "address_line",
        "city",
        "dni_address",
        "dni_number",
        "full_name",
        "location",
        "phone",
        "postal_code",
        "province",
      ].sort(),
    );
  });

  it("con sólo los 4 del wizard viejo todavía falta", () => {
    // El caso que dejaba pasar al wizard: nombre, teléfono, ubicación y DNI.
    const soloCuatro = {
      full_name: COMPLETO.full_name,
      phone: COMPLETO.phone,
      location: COMPLETO.location,
      dni_number: COMPLETO.dni_number,
    };

    expect(datosPersonalesCompletos(soloCuatro)).toBe(false);
    expect(datosPersonalesFaltantes(soloCuatro)).toEqual([
      "dirección del DNI",
      "dirección de entrega",
      "ciudad",
      "provincia",
      "código postal",
    ]);
  });

  it("un campo con espacios no cuenta como cargado", () => {
    expect(datosPersonalesFaltantes({ ...COMPLETO, city: "   " })).toEqual(["ciudad"]);
  });

  it("null y undefined cuentan como faltantes", () => {
    expect(datosPersonalesFaltantes({ ...COMPLETO, dni_address: null })).toEqual(["dirección del DNI"]);
    expect(datosPersonalesFaltantes(undefined)).toHaveLength(9);
    expect(datosPersonalesCompletos(null)).toBe(false);
  });
});
