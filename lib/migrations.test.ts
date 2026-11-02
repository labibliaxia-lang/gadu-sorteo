import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Contrato entre el código y las migraciones, sin base de datos.
 *
 * Nace del hallazgo #2 de la auditoría: `0025` creaba la función del trigger y
 * no el trigger, así que la protección existía en el repositorio y no en
 * Postgres. Esto detecta la mitad de ese problema que se puede ver desde el
 * repo —una función declarada sin su trigger, una RPC llamada que ninguna
 * migración define— y se ejecuta con `npm test`.
 *
 * No prueba nada sobre la base aplicada: para eso está
 * `supabase/tests/verificar_esquema.sql`, que hay que correr en el SQL Editor.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const SOURCE_DIRS = ["app", "lib", "components"];

/** Desde esta versión, cada migración debe registrarse en el ledger (0028). */
const LEDGER_FROM = "0028";

const IDENT = "[a-zA-Z_][a-zA-Z_0-9]*";

/** Todo el SQL de las migraciones, en orden de archivo. */
function migrationsSql(): string {
  return migrationFiles()
    .map((f) => f.sql)
    .join("\n");
}

/** Cada migración con su versión y su nombre de archivo. */
function migrationFiles(): { version: string; name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
    .map((f) => ({
      version: f.slice(0, 4),
      name: f,
      sql: readFileSync(join(MIGRATIONS_DIR, f), "utf8"),
    }));
}

/** Archivos .ts/.tsx del código de la app. */
function sourceFiles(dir: string): string[] {
  const absolute = join(ROOT, dir);
  const out: string[] = [];

  const walk = (path: string) => {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
    }
  };

  walk(absolute);
  return out;
}

function declaredFunctions(sql: string): Set<string> {
  const re = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?(${IDENT})`,
    "gi",
  );
  return new Set(
    [...sql.matchAll(re)].map((m) => m[1].toLowerCase()),
  );
}

/** Pares trigger → función, uno por cada `create trigger`. */
function declaredTriggers(sql: string): { trigger: string; fn: string }[] {
  const parts = sql.split(/create\s+trigger\s+/i).slice(1);
  const out: { trigger: string; fn: string }[] = [];

  for (const part of parts) {
    const name = new RegExp(`^(${IDENT})`, "i").exec(part);
    const call = new RegExp(
      `execute\\s+(?:procedure|function)\\s+(?:public\\.)?(${IDENT})`,
      "i",
    ).exec(part);
    if (name && call) out.push({ trigger: name[1], fn: call[1] });
  }

  return out;
}

/** RPC que el código invoca: `.rpc("nombre"`, también en varias líneas. */
function rpcCalls(files: string[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const re = new RegExp(`\\.rpc\\(\\s*["'\`](${IDENT})["'\`]`, "g");

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(re)) {
      const name = match[1];
      const where = relative(ROOT, file).split("\\").join("/");
      found.set(name, [...(found.get(name) ?? []), where]);
    }
  }

  return found;
}

const SQL = migrationsSql();
const FUNCTIONS = declaredFunctions(SQL);
const TRIGGERS = declaredTriggers(SQL);
const RPCS = rpcCalls(SOURCE_DIRS.flatMap(sourceFiles));

describe("código y migraciones", () => {
  it("encuentra las migraciones y el código que usa RPC", () => {
    // Si esto falla, los lectores de arriba se rompieron y el resto del test
    // estaría pasando por vacío.
    expect(SQL.length).toBeGreaterThan(10_000);
    expect(RPCS.size).toBeGreaterThan(5);
    expect(TRIGGERS.length).toBeGreaterThan(2);
  });

  it("toda RPC que llama el código está declarada en alguna migración", () => {
    const missing = [...RPCS.entries()]
      .filter(([name]) => !FUNCTIONS.has(name.toLowerCase()))
      .map(([name, files]) => `${name} (usada en ${[...new Set(files)].join(", ")})`);

    expect(missing).toEqual([]);
  });

  it("toda función que invoca un trigger está declarada", () => {
    const missing = TRIGGERS.filter((t) => !FUNCTIONS.has(t.fn.toLowerCase()))
      .map((t) => `${t.trigger} -> ${t.fn}`);

    expect(missing).toEqual([]);
  });

  it("el trigger de columnas sensibles tiene función Y trigger (regresión de 0025)", () => {
    // La función estaba y el trigger no: `plan`, KYC y solicitudes quedaron sin
    // proteger durante días, y nada en el repo lo delataba.
    expect(FUNCTIONS.has("prevent_sensitive_self_update")).toBe(true);
    expect(TRIGGERS.map((t) => t.trigger.toLowerCase())).toContain(
      "prevent_sensitive_self_update",
    );
  });

  it("las RPC que mueven dinero se llaman y existen", () => {
    for (const name of [
      "reserve_numbers",
      "sell_numbers",
      "release_numbers",
      "reward_referral",
    ]) {
      expect(RPCS.has(name), `${name} debería usarse en el código`).toBe(true);
      expect(FUNCTIONS.has(name), `${name} debería estar declarada`).toBe(true);
    }
  });

  it("toda migración desde 0028 se registra en el ledger", () => {
    // El ledger sólo vale si no se puede olvidar. Las versiones anteriores no
    // tienen fila: no hay registro de que hayan corrido, y no se inventa.
    const files = migrationFiles().filter((f) => f.version >= LEDGER_FROM);

    // Sin esto, el test pasaría por vacío si el lector no encontrara archivos.
    expect(files.length).toBeGreaterThan(0);

    const missing = files
      .filter(
        (f) =>
          !/insert\s+into\s+public\._applied_migrations/i.test(f.sql) ||
          !f.sql.includes(`'${f.version}'`),
      )
      .map((f) => f.name);

    expect(missing).toEqual([]);
  });
});
