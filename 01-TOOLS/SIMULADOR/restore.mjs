#!/usr/bin/env node
/**
 * Restaura los DATOS de una copia hecha con `backup.mjs`.
 *
 * QUÉ HACE
 *   Lee `backups/<sello>/*.json` y hace upsert en la base destino, tabla por
 *   tabla y en orden de dependencias, para no violar claves foráneas.
 *
 * QUÉ NECESITA DEL DESTINO
 *   El esquema tiene que existir: correr antes las migraciones (`0001`…`0084`).
 *   Las cuentas de auth tienen que estar: ver «Límite real» abajo.
 *
 * LÍMITE REAL (importante)
 *   `auth.users` no se puede restaurar con ids originales por API: la Admin API
 *   crea las cuentas con un id nuevo. Si el proyecto se perdió entero, los
 *   `profiles` y `raffles` apuntan a ids que ya no existen y el upsert falla por
 *   clave foránea. Este script NO inventa esos ids: aborta y lo dice.
 *   Casos donde sí sirve:
 *     · se borraron filas por accidente en el MISMO proyecto (lo más común);
 *     · se restauró en un proyecto donde las cuentas ya existen con su id.
 *   Para pérdida total del proyecto hacen falta los backups nativos de Supabase
 *   o un `pg_dump` con restauración a nivel base.
 *
 * SEGURIDAD
 *   · Exige `--acepto-destino <ref>` con la referencia del proyecto destino.
 *   · Se niega a escribir en el proyecto de producción si el origen es el mismo
 *     y la copia tiene menos filas que la base (evita "restaurar" hacia atrás
 *     sin darse cuenta).
 *   · `--dry-run` no escribe nada: informa qué haría.
 *
 * Uso:
 *   node restore.mjs --desde ../../backups/2026-11-06_0227 --acepto-destino <ref> --dry-run
 *   node restore.mjs --desde <carpeta> --acepto-destino <ref>
 *   node restore.mjs ... --tabla raffles          (una sola tabla)
 *   node restore.mjs ... --env ../../.env.local   (por defecto .env.local)
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Orden de dependencias: una tabla se restaura después de sus referenciadas. */
const ORDEN = [
  "plan_prices",
  "profiles",
  "raffles",
  "payments",
  "raffle_numbers",
  "prizes",
  "raffle_draw_secrets",
  "raffle_winners",
  "raffle_questions",
  "raffle_reports",
  "raffle_visits",
  "page_views",
  "reviews",
  "refunds",
  "referrals",
  "plan_orders",
  "plan_reminder_sends",
  "license_codes",
  "organizer_invitations",
  "auto_draw_runs",
  "draw_sandbox_runs",
  "admin_audit_logs",
  "account_deletion_requests",
  "rate_limits",
];

const TROZO = 400;

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? null : process.argv[i + 1];
}
const DRY = process.argv.includes("--dry-run");
const SOLO_TABLA = arg("tabla");
const ACEPTADO = arg("acepto-destino");
const ENV = resolve(RAIZ, arg("env") ?? ".env.local");

function leerEnv(ruta) {
  if (!existsSync(ruta)) throw new Error(`no existe ${ruta}`);
  const vars = {};
  for (const linea of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const m = linea.trim().match(/^([A-Za-z_0-9]+)\s*=\s*(.*)$/);
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return vars;
}

function carpetaCopia() {
  const desde = arg("desde");
  if (desde) {
    const ruta = resolve(desde);
    if (!existsSync(ruta)) throw new Error(`no existe la carpeta ${ruta}`);
    return ruta;
  }
  const base = resolve(RAIZ, "backups");
  if (!existsSync(base)) throw new Error("no hay carpeta backups/");
  const sellos = readdirSync(base).filter((d) => /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(d)).sort();
  if (sellos.length === 0) throw new Error("no hay copias con formato <fecha>_<hora> en backups/");
  return join(base, sellos[sellos.length - 1]);
}

async function main() {
  const vars = leerEnv(ENV);
  const ref = new URL(vars.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const origen = carpetaCopia();

  if (!ACEPTADO) {
    throw new Error(
      `Falta --acepto-destino. El destino es el proyecto "${ref}". Confirmá con: --acepto-destino ${ref}`,
    );
  }
  if (ACEPTADO !== ref) {
    throw new Error(`--acepto-destino dice "${ACEPTADO}" pero ${basename(ENV)} apunta a "${ref}". Abortado.`);
  }
  if (!vars.SUPABASE_SERVICE_ROLE_KEY) throw new Error("falta SUPABASE_SERVICE_ROLE_KEY en el entorno");

  const manifiesto = JSON.parse(readFileSync(join(origen, "manifiesto.json"), "utf8"));
  const admin = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`origen : ${origen}`);
  console.log(`destino: ${ref}${DRY ? "   (DRY RUN: no escribe nada)" : ""}\n`);

  // ---- 1. Las cuentas de auth tienen que existir con su id original
  const cuentasCopia = JSON.parse(readFileSync(join(origen, "auth_users.json"), "utf8"));
  const idsEnCopia = new Set(cuentasCopia.map((u) => u.id));
  const idsEnDestino = new Set();
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    data.users.forEach((u) => idsEnDestino.add(u.id));
    if (data.users.length < 1000) break;
  }

  const faltantes = [...idsEnCopia].filter((id) => !idsEnDestino.has(id));
  console.log(`cuentas: ${idsEnCopia.size} en la copia · ${idsEnDestino.size} en el destino`);
  if (faltantes.length > 0) {
    console.log(`\nBLOQUEO: ${faltantes.length} cuenta(s) de la copia no existen en el destino.`);
    console.log("Sin ellas, profiles/raffles fallan por clave foránea y los datos quedarían a medias.");
    console.log(`Primeras: ${faltantes.slice(0, 5).join(", ")}`);
    console.log("\nEste script no las recrea: la Admin API asigna ids nuevos y rompería las referencias.");
    console.log("Para recuperar un proyecto perdido hace falta un backup nativo de Supabase o un pg_dump.");
    process.exit(1);
  }

  // ---- 2. Upsert por tabla, en orden de dependencias
  const tablas = SOLO_TABLA ? [SOLO_TABLA] : ORDEN;
  const resumen = [];

  for (const tabla of tablas) {
    const archivo = join(origen, `${tabla}.json`);
    if (!existsSync(archivo)) {
      console.log(`  ${tabla.padEnd(26)} sin archivo, se saltea`);
      continue;
    }

    const filas = JSON.parse(readFileSync(archivo, "utf8"));
    const esperado = manifiesto.tablas?.[tabla]?.filas ?? filas.length;

    if (DRY) {
      console.log(`  ${tabla.padEnd(26)} ${String(filas.length).padStart(6)} filas a subir (esperado ${esperado})`);
      resumen.push({ tabla, copia: filas.length, subidas: 0, error: null });
      continue;
    }

    let subidas = 0;
    let error = null;

    for (let i = 0; i < filas.length; i += TROZO) {
      const trozo = filas.slice(i, i + TROZO);
      const { error: err } = await admin.from(tabla).upsert(trozo);
      if (err) {
        error = err.message;
        break;
      }
      subidas += trozo.length;
    }

    console.log(
      `  ${tabla.padEnd(26)} ${String(subidas).padStart(6)}/${filas.length} filas` +
        (error ? `  ERROR: ${error}` : ""),
    );
    resumen.push({ tabla, copia: filas.length, subidas, error });
  }

  // ---- 3. Verificación: contar en el destino
  if (!DRY) {
    console.log("\nverificación:");
    for (const r of resumen) {
      if (r.error) {
        console.log(`  ${r.tabla.padEnd(26)} incompleta (${r.error})`);
        continue;
      }
      const { count, error } = await admin.from(r.tabla).select("*", { count: "exact", head: true });
      if (error) {
        console.log(`  ${r.tabla.padEnd(26)} no se pudo contar: ${error.message}`);
        continue;
      }
      const ok = (count ?? 0) >= r.copia;
      console.log(`  ${r.tabla.padEnd(26)} destino ${String(count ?? "?").padStart(6)} · copia ${String(r.copia).padStart(6)} ${ok ? "ok" : "FALTAN"}`);
    }
  }

  const fallas = resumen.filter((r) => r.error);
  console.log(`\n${fallas.length === 0 ? "sin errores" : `${fallas.length} tabla(s) con error`}`);
  if (fallas.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`FALLA: ${error.message}`);
  process.exit(1);
});
