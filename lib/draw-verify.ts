/**
 * Fórmula pública de verificación del sorteo.
 *
 * La usan el verificador del navegador y los tests de vectores fijos. Debe
 * coincidir exactamente con `draw_winner_core` y con el simulador:
 *
 *   commitment   = SHA-256("gadu:v1|raffle:<id>|seed:<seed>")
 *   numbers_hash = SHA-256("gadu:v1|raffle:<id>|numbers:<sorted csv>")
 *   pick         = SHA-256("...|seed:<seed>|numbers:<sorted csv>")
 *   índice       = primeros 15 hex de pick (60 bits) % cantidad
 *   result_hash  = SHA-256("...|winner:<n>|numbers:<sorted csv>")
 */

export const DRAW_DOMAIN = "gadu:v1";

export interface DrawVerificationInput {
  raffleId: string;
  seed: string;
  numbers: number[];
}

export interface DrawVerificationResult {
  commitment: string;
  numbersHash: string;
  resultHash: string;
  pick: string;
  index: number;
  winner: number | null;
  sortedNumbers: number[];
  list: string;
}

/** Lista canónica: enteros positivos, ascendentes, separados por coma. */
export function canonicalNumbers(numbers: number[]): number[] {
  return [...new Set(numbers)]
    .filter((value) => Number.isInteger(value) && value >= 1)
    .sort((a, b) => a - b);
}

export function parseNumberList(text: string): number[] {
  return canonicalNumbers(
    text
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map(Number)
      .filter((value) => Number.isInteger(value) && value >= 1),
  );
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeDrawVerification({
  raffleId,
  seed,
  numbers,
}: DrawVerificationInput): Promise<DrawVerificationResult> {
  const sortedNumbers = canonicalNumbers(numbers);
  const list = sortedNumbers.join(",");

  const commitment = await sha256Hex(
    `${DRAW_DOMAIN}|raffle:${raffleId}|seed:${seed}`,
  );
  const numbersHash = await sha256Hex(
    `${DRAW_DOMAIN}|raffle:${raffleId}|numbers:${list}`,
  );
  const pick = await sha256Hex(
    `${DRAW_DOMAIN}|raffle:${raffleId}|seed:${seed}|numbers:${list}`,
  );

  let index = 0;
  let winner: number | null = null;

  if (sortedNumbers.length > 0) {
    // La base usa 60 bits y el resto de la división: BigInt evita perder
    // precisión con números por encima de 2^53.
    index = Number(
      BigInt(`0x${pick.slice(0, 15)}`) % BigInt(sortedNumbers.length),
    );
    winner = sortedNumbers[index] ?? null;
  }

  const resultHash =
    winner === null
      ? ""
      : await sha256Hex(
          `${DRAW_DOMAIN}|raffle:${raffleId}|winner:${winner}|numbers:${list}`,
        );

  return {
    commitment,
    numbersHash,
    resultHash,
    pick,
    index,
    winner,
    sortedNumbers,
    list,
  };
}
