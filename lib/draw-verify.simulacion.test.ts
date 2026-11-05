import { createHash, webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  computeDrawVerification,
  computeMultiPrizeVerification,
} from "./draw-verify";
import {
  ESCENARIO_CHICO,
  ESCENARIO_GRANDE,
  ESCENARIO_MANIPULADO,
  ESCENARIO_MULTI,
  ESCENARIO_UNICO,
  SEMILLA_FIJA,
  SORTEO_DEMO,
} from "../sim/dataset";

// Node no siempre expone Web Crypto como global en el entorno de tests.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

/**
 * Verificador externo independiente.
 *
 * No importa `lib/draw-verify.ts`: implementa la fórmula pública desde cero con
 * `node:crypto`, que es lo que haría una persona con una terminal. Sirve para
 * detectar que el verificador del navegador y el motor de la base no se
 * separaron. Sólo comparte con el motor el contrato publicado: dominio,
 * separadores y los primeros 60 bits del hash como índice.
 */

const sha256 = (texto: string): string =>
  createHash("sha256").update(texto, "utf8").digest("hex");

const canonica = (numeros: number[]): number[] =>
  [...new Set(numeros)]
    .filter((numero) => Number.isInteger(numero) && numero >= 1)
    .sort((a, b) => a - b);

const compromisoExterno = (sorteo: string, semilla: string): string =>
  sha256(`gadu:v1|raffle:${sorteo}|seed:${semilla}`);

const huellaListado = (sorteo: string, numeros: number[]): string =>
  sha256(`gadu:v1|raffle:${sorteo}|numbers:${canonica(numeros).join(",")}`);

const huellaResultado = (
  sorteo: string,
  ganador: number,
  numeros: number[],
): string =>
  sha256(
    `gadu:v1|raffle:${sorteo}|winner:${ganador}|numbers:${canonica(numeros).join(",")}`,
  );

const indiceDesde = (hash: string, cantidad: number): number =>
  Number(BigInt(`0x${hash.slice(0, 15)}`) % BigInt(cantidad));

interface SeleccionExterna {
  semillaHash: string;
  indice: number;
  ganador: number;
}

const seleccionExterna = (
  sorteo: string,
  semilla: string,
  numeros: number[],
): SeleccionExterna => {
  const listado = canonica(numeros);
  const semillaHash = sha256(
    `gadu:v1|raffle:${sorteo}|seed:${semilla}|numbers:${listado.join(",")}`,
  );
  const indice = indiceDesde(semillaHash, listado.length);
  const ganador = listado[indice];
  if (ganador === undefined) {
    throw new Error("El listado no tiene números: no hay ganador posible.");
  }
  return { semillaHash, indice, ganador };
};

interface GanadorExterno {
  position: number;
  number: number;
  hash: string;
}

const multipremioExterno = (
  sorteo: string,
  semilla: string,
  numeros: number[],
  premios: number,
): GanadorExterno[] => {
  const listado = canonica(numeros);
  const csv = listado.join(",");
  const restantes = [...listado];
  const ganadores: GanadorExterno[] = [];
  const total = Math.min(premios, restantes.length);

  for (let posicion = 1; posicion <= total; posicion += 1) {
    const restantesCsv = restantes.join(",");
    const base =
      posicion === 1
        ? `gadu:v1|raffle:${sorteo}|seed:${semilla}|numbers:${csv}`
        : `gadu:v1|raffle:${sorteo}|seed:${semilla}|prize:${posicion}|numbers:${restantesCsv}`;
    const indice = indiceDesde(sha256(base), restantes.length);
    const numero = restantes[indice];
    if (numero === undefined) break;

    const hash =
      posicion === 1
        ? sha256(
            `gadu:v1|raffle:${sorteo}|winner:${numero}|numbers:${csv}`,
          )
        : sha256(
            `gadu:v1|raffle:${sorteo}|prize:${posicion}|winner:${numero}|numbers:${restantesCsv}`,
          );

    ganadores.push({ position: posicion, number: numero, hash });
    restantes.splice(indice, 1);
  }

  return ganadores;
};

describe("verificador externo contra el motor", () => {
  it.each([
    ["chico de 10 números", ESCENARIO_CHICO],
    ["grande de 10.000 números", ESCENARIO_GRANDE],
    ["un solo participante", ESCENARIO_UNICO],
  ])("coincide en el escenario %s", async (_nombre, escenario) => {
    const motor = await computeDrawVerification({
      raffleId: SORTEO_DEMO,
      seed: SEMILLA_FIJA,
      numbers: escenario.numeros,
    });
    const externo = seleccionExterna(SORTEO_DEMO, SEMILLA_FIJA, escenario.numeros);

    expect(motor.commitment).toBe(compromisoExterno(SORTEO_DEMO, SEMILLA_FIJA));
    expect(motor.numbersHash).toBe(huellaListado(SORTEO_DEMO, escenario.numeros));
    expect(motor.index).toBe(externo.indice);
    expect(motor.winner).toBe(externo.ganador);
    expect(motor.resultHash).toBe(
      huellaResultado(SORTEO_DEMO, externo.ganador, escenario.numeros),
    );

    // El ganador siempre sale del listado vendido, nunca de afuera.
    expect(escenario.numeros).toContain(externo.ganador);
  });

  it("con un solo participante el ganador es su único número", async () => {
    const unico = await computeDrawVerification({
      raffleId: SORTEO_DEMO,
      seed: SEMILLA_FIJA,
      numbers: ESCENARIO_UNICO.numeros,
    });

    expect(unico.winner).toBe(7);
    expect(unico.index).toBe(0);
  });

  it("el ganador siempre es un número vendido, con cualquier semilla", async () => {
    const escenarios = [ESCENARIO_UNICO, ESCENARIO_CHICO, ESCENARIO_MULTI];

    for (const escenario of escenarios) {
      for (let vuelta = 0; vuelta < 20; vuelta += 1) {
        const semilla = sha256(`semilla-de-prueba-${vuelta}`);
        const externo = seleccionExterna(SORTEO_DEMO, semilla, escenario.numeros);
        expect(escenario.numeros).toContain(externo.ganador);
      }
    }
  });

  it("el orden y los duplicados del listado no cambian el resultado", async () => {
    const ordenado = await computeDrawVerification({
      raffleId: SORTEO_DEMO,
      seed: SEMILLA_FIJA,
      numbers: ESCENARIO_CHICO.numeros,
    });
    const desordenado = await computeDrawVerification({
      raffleId: SORTEO_DEMO,
      seed: SEMILLA_FIJA,
      numbers: [7, 3, 10, 1, 9, 2, 5, 4, 8, 6, 7, 3],
    });

    expect(desordenado).toEqual(ordenado);
  });
});

describe("verificación que delata manipulación", () => {
  it("cambiar un número del listado cambia las huellas", async () => {
    const publicado = await computeDrawVerification({
      raffleId: SORTEO_DEMO,
      seed: SEMILLA_FIJA,
      numbers: ESCENARIO_CHICO.numeros,
    });
    const manipulacion = ESCENARIO_MANIPULADO.manipulacion;
    if (!manipulacion) throw new Error("El escenario no define una manipulación.");

    const alterado = [...ESCENARIO_CHICO.numeros];
    alterado[manipulacion.indice] = manipulacion.valor;

    const recalculado = await computeDrawVerification({
      raffleId: SORTEO_DEMO,
      seed: SEMILLA_FIJA,
      numbers: alterado,
    });

    // El listado cambió: la huella del listado y el resultado ya no coinciden.
    expect(recalculado.numbersHash).not.toBe(publicado.numbersHash);
    expect(huellaListado(SORTEO_DEMO, alterado)).not.toBe(publicado.numbersHash);
    expect(recalculado.resultHash).not.toBe(publicado.resultHash);
    if (publicado.winner === null) throw new Error("El sorteo no tuvo ganador.");
    expect(huellaResultado(SORTEO_DEMO, publicado.winner, alterado)).not.toBe(
      publicado.resultHash,
    );

    // El compromiso no depende del listado: por eso la manipulación la delatan
    // las huellas y el ganador, no el compromiso.
    expect(publicado.commitment).toBe(
      compromisoExterno(SORTEO_DEMO, SEMILLA_FIJA),
    );
  });

  it("cambiar la semilla publicada cambia el compromiso", async () => {
    const publicado = await computeDrawVerification({
      raffleId: SORTEO_DEMO,
      seed: SEMILLA_FIJA,
      numbers: ESCENARIO_CHICO.numeros,
    });
    const semillaFalsa = sha256("una-semilla-que-no-es-la-comprometida");

    expect(compromisoExterno(SORTEO_DEMO, semillaFalsa)).not.toBe(
      publicado.commitment,
    );
  });

  it("un resultado inventado no reproduce las huellas oficiales", async () => {
    const publicado = await computeDrawVerification({
      raffleId: SORTEO_DEMO,
      seed: SEMILLA_FIJA,
      numbers: ESCENARIO_CHICO.numeros,
    });
    const ganadorInventado = publicado.winner === 1 ? 2 : 1;

    expect(
      huellaResultado(SORTEO_DEMO, ganadorInventado, ESCENARIO_CHICO.numeros),
    ).not.toBe(publicado.resultHash);
  });
});

describe("multipremio sin repetir ganadores", () => {
  it("50 premios sobre 100 números coinciden con el verificador externo", async () => {
    const motor = await computeMultiPrizeVerification({
      raffleId: SORTEO_DEMO,
      seed: SEMILLA_FIJA,
      numbers: ESCENARIO_MULTI.numeros,
      prizesCount: ESCENARIO_MULTI.premios,
    });
    const externo = multipremioExterno(
      SORTEO_DEMO,
      SEMILLA_FIJA,
      ESCENARIO_MULTI.numeros,
      ESCENARIO_MULTI.premios,
    );

    expect(motor.winners).toEqual(externo);
    expect(motor.winners).toHaveLength(50);
    expect(new Set(motor.winners.map((ganador) => ganador.number)).size).toBe(50);
    expect(motor.winners.map((ganador) => ganador.position)).toEqual(
      Array.from({ length: 50 }, (_, posicion) => posicion + 1),
    );
    for (const ganador of motor.winners) {
      expect(ganador.hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("el premio 1 coincide con el verificador de un solo ganador", async () => {
    const simple = await computeDrawVerification({
      raffleId: SORTEO_DEMO,
      seed: SEMILLA_FIJA,
      numbers: ESCENARIO_MULTI.numeros,
    });
    const multi = await computeMultiPrizeVerification({
      raffleId: SORTEO_DEMO,
      seed: SEMILLA_FIJA,
      numbers: ESCENARIO_MULTI.numeros,
      prizesCount: 3,
    });

    expect(multi.winners[0]?.number).toBe(simple.winner);
    expect(multi.winners[0]?.hash).toBe(simple.resultHash);
  });

  it("el mismo sorteo, verificado dos veces, da el mismo resultado", async () => {
    const primera = await computeMultiPrizeVerification({
      raffleId: SORTEO_DEMO,
      seed: SEMILLA_FIJA,
      numbers: ESCENARIO_MULTI.numeros,
      prizesCount: 10,
    });
    const segunda = await computeMultiPrizeVerification({
      raffleId: SORTEO_DEMO,
      seed: SEMILLA_FIJA,
      numbers: ESCENARIO_MULTI.numeros,
      prizesCount: 10,
    });

    expect(segunda).toEqual(primera);
  });
});
