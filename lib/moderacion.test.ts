import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Contrato de la moderación: pausar un sorteo denunciado tiene que SACARLO del
 * listado público, no sólo cerrar la venta.
 *
 * Por qué existe este test: `pauseReportedRaffle` hacía `active → closed` y con
 * eso alcanzaba para frenar la venta, pero no para bajar el sorteo de la home —
 * la home lista todo y sólo filtra por `is_listed`. El denunciado seguía en
 * cartelera, clickeable, con su texto y su WhatsApp.
 *
 * Se lee el código fuente, como hace `migrations.test.ts` con el SQL: si alguien
 * vuelve a dejar sólo `status: "closed"`, esto falla.
 */

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const ACCIONES = readFileSync(join(RAIZ, "app/admin/super/actions.ts"), "utf8");

/** Recorta el cuerpo de una función por su firma hasta la llave que la cierra. */
function cuerpoDe(nombre: string): string {
  const inicio = ACCIONES.indexOf(`export async function ${nombre}(`);
  expect(inicio, `${nombre} no está en super/actions.ts`).toBeGreaterThan(-1);

  // Hasta el siguiente `export async function` o el final del archivo.
  const siguiente = ACCIONES.indexOf("export async function", inicio + 10);
  return ACCIONES.slice(inicio, siguiente === -1 ? undefined : siguiente);
}

describe("moderación: pausar un sorteo denunciado", () => {
  it("pausar también deslista, para que salga de la home", () => {
    const cuerpo = cuerpoDe("pauseReportedRaffle");

    expect(cuerpo).toMatch(/status:\s*"closed"/);
    expect(cuerpo).toMatch(/is_listed:\s*false/);
  });

  it("no pisa un sorteo que dejó de estar activo", () => {
    const cuerpo = cuerpoDe("pauseReportedRaffle");

    // La guarda del UPDATE: si el organizador ya lo cerró o sorteó, no se toca.
    expect(cuerpo).toMatch(/\.eq\("status",\s*"active"\)/);
  });

  it("queda auditado, incluyendo que se deslistó", () => {
    const cuerpo = cuerpoDe("pauseReportedRaffle");

    expect(cuerpo).toMatch(/REPORT_RAFFLE_PAUSE/);
    expect(cuerpo).toMatch(/unlisted:\s*true/);
  });
});
