#!/usr/bin/env node
/**
 * Candado de entorno. Se ejecuta antes de cualquier paso que escriba.
 *
 * Reglas:
 *  1. Tiene que existir `.env.test.local`. Si no existe, aborta.
 *  2. La URL de Supabase no puede ser la base viva de producción.
 *  3. La URL objetivo no puede ser el deploy de Vercel.
 *
 * Si algo falla, sale con código 1 y NO se corre nada más.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "../..");

/** Ref del proyecto Supabase de producción. Confirmada leyendo el HTML de Vercel. */
export const REF_PRODUCCION = "mjgcoeikcyzwojbqtuah";

/** Host del deploy público. Nunca se escribe contra él. */
export const HOST_PRODUCCION = "gadu-sorteo-doci.vercel.app";

/**
 * Carga las variables de la corrida.
 *
 * Por defecto: `.env.test.local`, y PRODUCCIÓN ESTÁ PROHIBIDA.
 *
 * Excepción declarada: cuando el dueño del proyecto autoriza explícitamente
 * correr contra su web real (2026-11-05), se habilita con
 *   SIM_ACEPTO_PRODUCCION=1 SIM_ENV_FILE=.env.prod-sim.local
 * El candado no se debilita: sin esas dos variables, producción sigue
 * bloqueada y el mensaje de error lo dice.
 */
export function cargarEnvTest(opciones = {}) {
  const archivo = opciones.archivo ?? process.env.SIM_ENV_FILE ?? ".env.test.local";
  const aceptoProduccion =
    opciones.aceptoProduccion ?? process.env.SIM_ACEPTO_PRODUCCION === "1";

  const ENV_TEST = resolve(RAIZ, archivo);

  if (!existsSync(ENV_TEST)) {
    throw new Error(
      `BLOQUEO: no existe ${archivo} en ${RAIZ}. No se ejecuta nada sin entorno declarado.`,
    );
  }

  const vars = {};
  for (const linea of readFileSync(ENV_TEST, "utf8").split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const m = limpia.match(/^([A-Za-z_0-9]+)\s*=\s*(.*)$/);
    if (!m) continue;
    vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }

  const url = vars.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url.startsWith("http")) {
    throw new Error(`BLOQUEO: NEXT_PUBLIC_SUPABASE_URL falta o no es una URL en ${archivo}.`);
  }
  if (url.includes(REF_PRODUCCION) && !aceptoProduccion) {
    throw new Error(
      `BLOQUEO: ${url} es la base de PRODUCCIÓN (ref ${REF_PRODUCCION}). No se escribe ahí. ` +
        `Para una corrida autorizada: SIM_ACEPTO_PRODUCCION=1 SIM_ENV_FILE=${archivo}`,
    );
  }

  const objetivo = vars.NEXT_PUBLIC_URL ?? "";
  if (objetivo.includes(HOST_PRODUCCION) && !aceptoProduccion) {
    throw new Error(`BLOQUEO: el objetivo ${objetivo} es el deploy público.`);
  }

  for (const clave of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!vars[clave]) throw new Error(`BLOQUEO: falta ${clave} en ${archivo}.`);
  }

  return { vars, envPath: ENV_TEST, objetivo, produccion: url.includes(REF_PRODUCCION) };
}

const ejecutadoDirecto =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (ejecutadoDirecto) {
  try {
    const { vars, objetivo } = cargarEnvTest();
    console.log("OK entorno de prueba");
    console.log(`  supabase: ${vars.NEXT_PUBLIC_SUPABASE_URL}`);
    console.log(`  objetivo: ${objetivo || "(sin NEXT_PUBLIC_URL)"}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
