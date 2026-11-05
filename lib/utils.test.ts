import { describe, expect, it } from "vitest";

import { formatDateTime } from "@/lib/utils";

describe("formatDateTime", () => {
  it("formatea siempre en hora argentina, sin importar la zona de quien ejecuta", () => {
    // 2026-11-05 01:30 UTC = 22:30 del 4 de noviembre en Argentina (UTC-3).
    // es-AR muestra el reloj en 12 horas: "10:30 p. m.".
    const salida = formatDateTime("2026-11-05T01:30:00.000Z");

    expect(salida).toMatch(/10:30/);
    expect(salida).not.toMatch(/01:30/);
  });

  it("mantiene el huso en invierno (Argentina no tiene horario de verano)", () => {
    // 2026-07-10 15:00 UTC = 12:00 en Argentina.
    const salida = formatDateTime("2026-07-10T15:00:00.000Z");

    expect(salida).toMatch(/12:00/);
  });
});
