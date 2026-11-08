#!/usr/bin/env node
/**
 * Verificador INDEPENDIENTE de hashes de Gadu Sorteos.
 *
 * No importa `lib/draw-verify.ts` a propósito: si reusáramos el código del
 * servidor, un bug de fórmula pasaría desapercibido. Reimplementamos la
 * fórmula pública con node:crypto y comparamos contra lo que muestra la web.
 *
 * Fórmula (documentada en lib/draw-verify.ts, cabecera):
 *   commitment   = SHA-256("gadu:v1|raffle:<id>|seed:<seed>")
 *   numbers_hash = SHA-256("gadu:v1|raffle:<id>|numbers:<csv ascendente>")
 *   pick         = SHA-256("gadu:v1|raffle:<id>|seed:<seed>|numbers:<csv>")
 *   index        = primeros 15 hex de pick (60 bits) % cantidad
 *   result_hash  = SHA-256("gadu:v1|raffle:<id>|winner:<n>|numbers:<csv>")
 *
 * Uso:
 *   node verify-hash.mjs --raffle <uuid> --seed <hex64> --numbers 1,2,3
 *   node verify-hash.mjs --file caso.json      # {raffleId, seed, numbers, publicado?}
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DOMAIN = "gadu:v1";

const sha256 = (texto) => createHash("sha256").update(texto, "utf8").digest("hex");

/** Lista canónica: enteros >= 1, sin repetir, ascendente. */
export function canonical(numbers) {
  return [...new Set(numbers)]
    .filter((n) => Number.isInteger(n) && n >= 1)
    .sort((a, b) => a - b);
}

export function verificar({ raffleId, seed, numbers }) {
  const sorted = canonical(numbers);
  const list = sorted.join(",");

  const commitment = sha256(`${DOMAIN}|raffle:${raffleId}|seed:${seed}`);
  const numbersHash = sha256(`${DOMAIN}|raffle:${raffleId}|numbers:${list}`);
  const pick = sha256(`${DOMAIN}|raffle:${raffleId}|seed:${seed}|numbers:${list}`);

  let index = null;
  let winner = null;
  let resultHash = null;

  if (sorted.length > 0) {
    // 60 bits = 15 hex. BigInt para no perder precisión por encima de 2^53.
    index = Number(BigInt(`0x${pick.slice(0, 15)}`) % BigInt(sorted.length));
    winner = sorted[index] ?? null;
    if (winner !== null) {
      resultHash = sha256(`${DOMAIN}|raffle:${raffleId}|winner:${winner}|numbers:${list}`);
    }
  }

  return { commitment, numbersHash, pick, index, winner, resultHash, list, sorted };
}

/**
 * Verificación de varios premios sobre el mismo listado y semilla.
 *
 * Debe coincidir con `execute_sandbox_draw_v2` y con `computeMultiPrizeVerification`:
 *   premio 1: la fórmula del motor real sobre el listado completo;
 *   premio i>1: hash con |prize:i| sobre los números que quedan.
 *   results_hash liga la semilla y la lista de ganadores.
 */
export function verificarMulti({ raffleId, seed, numbers, prizesCount }) {
  const sorted = canonical(numbers);
  const list = sorted.join(",");

  const commitment = sha256(`${DOMAIN}|raffle:${raffleId}|seed:${seed}`);
  const numbersHash = sha256(`${DOMAIN}|raffle:${raffleId}|numbers:${list}`);

  const total = Math.max(1, Math.min(prizesCount, sorted.length));
  const remaining = [...sorted];
  const winners = [];
  const ganadores = [];

  for (let posicion = 1; posicion <= total; posicion += 1) {
    const resto = remaining.join(",");
    const pick = sha256(
      posicion === 1
        ? `${DOMAIN}|raffle:${raffleId}|seed:${seed}|numbers:${list}`
        : `${DOMAIN}|raffle:${raffleId}|seed:${seed}|prize:${posicion}|numbers:${resto}`,
    );

    const indice = Number(BigInt(`0x${pick.slice(0, 15)}`) % BigInt(remaining.length));
    const ganador = remaining[indice];
    if (ganador === undefined) break;

    const hash = sha256(
      posicion === 1
        ? `${DOMAIN}|raffle:${raffleId}|winner:${ganador}|numbers:${list}`
        : `${DOMAIN}|raffle:${raffleId}|prize:${posicion}|winner:${ganador}|numbers:${resto}`,
    );

    winners.push({ position: posicion, number: ganador, hash });
    ganadores.push(ganador);
    remaining.splice(indice, 1);
  }

  const resultsHash = sha256(
    `${DOMAIN}|raffle:${raffleId}|seed:${seed}|winners:${ganadores.join(",")}|numbers:${list}`,
  );

  return { commitment, numbersHash, winners, resultsHash, list, total };
}

/** Compara lo recalculado contra lo publicado en la web. */
export function comparar(recalculado, publicado) {
  const campos = ["commitment", "numbersHash", "winner", "resultHash"];
  const checks = campos.map((campo) => ({
    campo,
    recalculado: recalculado[campo],
    publicado: publicado?.[campo] ?? null,
    coincide: String(recalculado[campo]) === String(publicado?.[campo] ?? ""),
  }));
  return { checks, todosCoinciden: checks.every((c) => c.coincide) };
}

// ---------------------------------------------------------------- CLI
function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? null : process.argv[i + 1];
}

const ejecutadoDirecto =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (ejecutadoDirecto) {
  const archivo = arg("file");
  let caso;
  if (archivo) {
    caso = JSON.parse(readFileSync(archivo, "utf8"));
  } else {
    const numbers = (arg("numbers") ?? "").split(/[^0-9]+/).filter(Boolean).map(Number);
    caso = { raffleId: arg("raffle"), seed: arg("seed"), numbers };
  }
  const r = verificar(caso);
  const salida = { entrada: caso, recalculado: r };
  if (caso.publicado) salida.comparacion = comparar(r, caso.publicado);
  console.log(JSON.stringify(salida, null, 2));
  if (salida.comparacion && !salida.comparacion.todosCoinciden) process.exitCode = 2;
}
