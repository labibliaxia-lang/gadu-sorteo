#!/usr/bin/env node
/**
 * Copia de seguridad de los DATOS del proyecto.
 *
 * Qué respalda:
 *   · todas las tablas de `public` (paginadas, sin el tope de 1000 de PostgREST)
 *   · la lista de cuentas de auth.users (id, email, metadatos, fechas)
 *   · el inventario de archivos de Storage (ruta y tamaño)
 *
 * Qué NO respalda, y por qué no hace falta:
 *   · el ESQUEMA: vive en `supabase/migrations/` y está en git. Repo + datos
 *     alcanzan para reconstruir la base.
 *   · las contraseñas: no se pueden exportar (son hashes) y acá se entra con
 *     Google, así que el usuario no pierde nada.
 *   · el contenido de los archivos de Storage, salvo con `--archivos`: son
 *     imágenes y documentos de KYC. Copiarlos crea más lugares con datos
 *     personales; el inventario sirve para saber qué se perdió.
 *
 * Dónde escribe: `backups/<fecha-hora>/`, que está en .gitignore.
 *
 * Uso:
 *   node backup.mjs
 *   node backup.mjs --archivos        (además descarga los archivos)
 *   node backup.mjs --tabla raffles   (sólo una tabla, para probar)
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CON_ARCHIVOS = process.argv.includes("--archivos");
const SOLO_TABLA = process.argv.includes("--tabla")
  ? process.argv[process.argv.indexOf("--tabla") + 1]
  : null;

const AHORA = new Date();
const SELLO = AHORA.toISOString().slice(0, 16).replace("T", "_").replace(":", "");
const DESTINO = resolve(RAIZ, "backups", SELLO);

/** Tablas del proyecto, en orden de migraciones. Si alguna falta, se anota. */
const TABLAS = [
  "raffles", "raffle_numbers", "prizes", "payments", "profiles",
  "raffle_draw_secrets", "raffle_winners", "raffle_questions", "raffle_reports",
  "raffle_visits", "page_views", "reviews", "refunds", "referrals",
  "plan_prices", "plan_orders", "plan_reminder_sends", "license_codes",
  "organizer_invitations", "auto_draw_runs", "draw_sandbox_runs",
  "admin_audit_logs", "account_deletion_requests", "rate_limits",
  "_applied_migrations",
];

function leerEnv(archivo) {
  const ruta = resolve(RAIZ, archivo);
  if (!existsSync(ruta)) throw new Error(`no existe ${archivo}`);
  const vars = {};
  for (const linea of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const m = linea.trim().match(/^([A-Za-z_0-9]+)\s*=\s*(.*)$/);
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return vars;
}

const sha256 = (texto) => createHash("sha256").update(texto).digest("hex");

async function main() {
  const vars = leerEnv(".env.local");
  const admin = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  mkdirSync(DESTINO, { recursive: true });

  const manifiesto = {
    proyecto: vars.NEXT_PUBLIC_SUPABASE_URL,
    cuando: AHORA.toISOString(),
    tablas: {},
    auth: null,
    storage: {},
    advertencias: [],
  };

  // ---------------------------------------------------------------- tablas
  const tablas = SOLO_TABLA ? [SOLO_TABLA] : TABLAS;

  for (const tabla of tablas) {
    const filas = [];
    let desde = 0;
    const PAGINA = 1000;

    for (;;) {
      const { data, error } = await admin
        .from(tabla)
        .select("*")
        .range(desde, desde + PAGINA - 1);

      if (error) {
        manifiesto.advertencias.push(`${tabla}: ${error.message}`);
        break;
      }

      if (!data || data.length === 0) break;
      filas.push(...data);
      if (data.length < PAGINA) break;
      desde += PAGINA;
    }

    if (filas.length === 0 && manifiesto.advertencias.some((a) => a.startsWith(`${tabla}:`))) {
      continue;
    }

    const json = JSON.stringify(filas, null, 2);
    const archivo = `${tabla}.json`;
    writeFileSync(resolve(DESTINO, archivo), json, "utf8");
    manifiesto.tablas[tabla] = { filas: filas.length, bytes: Buffer.byteLength(json), sha256: sha256(json) };
    console.log(`  ${tabla.padEnd(26)} ${String(filas.length).padStart(6)} filas`);
  }

  // ---------------------------------------------------------------- cuentas
  if (!SOLO_TABLA) {
    const usuarios = [];
    for (let page = 1; page <= 100; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        manifiesto.advertencias.push(`auth.users: ${error.message}`);
        break;
      }
      usuarios.push(
        ...data.users.map((u) => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          providers: u.app_metadata?.providers ?? [],
          // Sin teléfonos ni claves: sólo lo necesario para reconstruir el mapa.
        })),
      );
      if (data.users.length < 1000) break;
    }

    const json = JSON.stringify(usuarios, null, 2);
    writeFileSync(resolve(DESTINO, "auth_users.json"), json, "utf8");
    manifiesto.auth = { cuentas: usuarios.length, bytes: Buffer.byteLength(json), sha256: sha256(json) };
    console.log(`  ${"auth.users".padEnd(26)} ${String(usuarios.length).padStart(6)} cuentas`);
  }

  // ---------------------------------------------------------------- storage
  if (!SOLO_TABLA) {
    for (const bucket of ["raffle-images", "organizer-kyc"]) {
      const { data, error } = await admin.storage.from(bucket).list("", { limit: 1000 });
      if (error) {
        manifiesto.advertencias.push(`storage ${bucket}: ${error.message}`);
        continue;
      }
      const objetos = (data ?? []).filter((o) => o.id !== null);
      manifiesto.storage[bucket] = {
        archivos: objetos.length,
        bytes: objetos.reduce((total, o) => total + (o.metadata?.size ?? 0), 0),
        detalle: objetos.map((o) => ({ nombre: o.name, bytes: o.metadata?.size ?? 0, actualizado: o.updated_at })),
      };
      console.log(`  ${`storage:${bucket}`.padEnd(26)} ${String(objetos.length).padStart(6)} archivos`);

      if (CON_ARCHIVOS && objetos.length > 0) {
        mkdirSync(resolve(DESTINO, "storage", bucket), { recursive: true });
        for (const objeto of objetos) {
          const { data: blob, error: errDescarga } = await admin.storage.from(bucket).download(objeto.name);
          if (errDescarga || !blob) {
            manifiesto.advertencias.push(`descarga ${bucket}/${objeto.name}: ${errDescarga?.message ?? "vacío"}`);
            continue;
          }
          const buffer = Buffer.from(await blob.arrayBuffer());
          writeFileSync(resolve(DESTINO, "storage", bucket, objeto.name), buffer);
        }
      }
    }
  }

  writeFileSync(resolve(DESTINO, "manifiesto.json"), JSON.stringify(manifiesto, null, 2), "utf8");

  const totalFilas = Object.values(manifiesto.tablas).reduce((t, x) => t + x.filas, 0);
  console.log(`\nlisto: ${DESTINO}`);
  console.log(`  ${Object.keys(manifiesto.tablas).length} tablas · ${totalFilas} filas · ${manifiesto.auth?.cuentas ?? 0} cuentas`);
  if (manifiesto.advertencias.length > 0) {
    console.log(`  ${manifiesto.advertencias.length} advertencias (ver manifiesto.json)`);
  }
  if (!CON_ARCHIVOS) {
    console.log("  archivos de storage: sólo inventario. Con --archivos también se descargan.");
  }
  console.log("  carpeta ignorada por git: los backups no se versionan.");
}

main().catch((error) => {
  console.error(`FALLA: ${error.message}`);
  process.exit(1);
});
