import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";

import { computeDrawVerification, parseNumberList } from "./draw-verify";

// Node no siempre expone Web Crypto como global en el entorno de tests.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

/**
 * Vectores canónicos calculados fuera del código (Node crypto + fórmula de
 * 0034). Si cambia un literal del dominio, el orden del listado o el índice,
 * estos tests fallan: sirven para detectar que el motor real y el simulador se
 * separaron.
 */
const VECTOR = {
  raffleId: "11111111-1111-4111-8111-111111111111",
  seed: "0123456789abcdef".repeat(4),
  numbers: [1, 2, 3, 5, 8, 13, 21, 34, 55, 89],
  commitment:
    "7ccb844285ecad2e97d871d451a2be62bf65d656db7bbc5e2eed0d98f6861eca",
  numbersHash:
    "ddc1ff15e29b1cba46f6073b7d68c01b6af6d362d0366cb4b327c24e33610561",
  resultHash:
    "ed4a7e966c9f80e1f35ae7d15d8d32010925b4d5902293dd52b4ab671dccfe53",
  index: 4,
  winner: 8,
} as const;

describe("fórmula del sorteo", () => {
  it("reproduce los vectores fijos de compromiso, huellas y ganador", async () => {
    const result = await computeDrawVerification({
      raffleId: VECTOR.raffleId,
      seed: VECTOR.seed,
      numbers: [...VECTOR.numbers],
    });

    expect(result.commitment).toBe(VECTOR.commitment);
    expect(result.numbersHash).toBe(VECTOR.numbersHash);
    expect(result.resultHash).toBe(VECTOR.resultHash);
    expect(result.index).toBe(VECTOR.index);
    expect(result.winner).toBe(VECTOR.winner);
    expect(result.list).toBe(VECTOR.numbers.join(","));
  });

  it("ordena y deduplica el listado antes de calcular", async () => {
    const result = await computeDrawVerification({
      raffleId: VECTOR.raffleId,
      seed: VECTOR.seed,
      numbers: [89, 8, 1, 55, 2, 3, 5, 8, 13, 21, 34],
    });

    expect(result.sortedNumbers).toEqual(VECTOR.numbers);
    expect(result.numbersHash).toBe(VECTOR.numbersHash);
    expect(result.resultHash).toBe(VECTOR.resultHash);
    expect(result.winner).toBe(VECTOR.winner);
  });

  it("cambiar un solo número cambia las huellas", async () => {
    const result = await computeDrawVerification({
      raffleId: VECTOR.raffleId,
      seed: VECTOR.seed,
      numbers: VECTOR.numbers.map((number) =>
        number === 89 ? 90 : number,
      ),
    });

    expect(result.numbersHash).not.toBe(VECTOR.numbersHash);
    expect(result.resultHash).not.toBe(VECTOR.resultHash);
  });

  it("no devuelve ganador sin números", async () => {
    const result = await computeDrawVerification({
      raffleId: VECTOR.raffleId,
      seed: VECTOR.seed,
      numbers: [],
    });

    expect(result.winner).toBeNull();
    expect(result.resultHash).toBe("");
  });

  it("parsea listados con espacios, puntos o comas", () => {
    expect(parseNumberList(" 1, 2. 3; 5\n13 ")).toEqual([1, 2, 3, 5, 13]);
    expect(parseNumberList("")).toEqual([]);
  });
});
