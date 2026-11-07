#!/usr/bin/env node
/**
 * Registro de evidencia. Una fila por paso, escrita DURANTE la corrida.
 *
 * Estructura (ver .dsh/skills/gadu-simulador/references/evidencia.md):
 *   02-DOCS/wiki/ftd/evidencia/<YYYY-MM-DD>[-sufijo]/
 *     pasos.json
 *     hashes.json
 *     capturas/
 *     red/
 *
 * Regla dura: una fila sin evidencia no puede quedar en `ok`.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function crearCorrida(sufijo = "", { reiniciar = false } = {}) {
  const fecha = new Date().toISOString().slice(0, 10);
  const dir = resolve(RAIZ, "02-DOCS/wiki/ftd/evidencia", `${fecha}${sufijo}`);
  mkdirSync(resolve(dir, "capturas"), { recursive: true });
  mkdirSync(resolve(dir, "red"), { recursive: true });

  const pasosPath = resolve(dir, "pasos.json");
  if (reiniciar || !existsSync(pasosPath)) writeFileSync(pasosPath, "[]\n", "utf8");

  return {
    dir,
    capturas: resolve(dir, "capturas"),

    /** Abre un paso; devuelve un objeto que se cierra con `cerrar`. */
    abrir({ paso, rol, esperado }) {
      const inicio = new Date().toISOString();
      return {
        cerrar({ observado, resultado, evidencia = [], nota = null }) {
          const fin = new Date().toISOString();
          const fila = {
            paso,
            rol,
            inicio,
            fin,
            duracionMs: new Date(fin) - new Date(inicio),
            esperado,
            observado,
            resultado,
            evidencia,
            nota,
          };
          if (resultado === "ok" && evidencia.length === 0) {
            fila.resultado = "pendiente";
            fila.nota = [nota, "sin evidencia: degradado de ok a pendiente"]
              .filter(Boolean)
              .join(" | ");
          }
          const filas = JSON.parse(readFileSync(pasosPath, "utf8"));
          filas.push(fila);
          writeFileSync(pasosPath, JSON.stringify(filas, null, 2) + "\n", "utf8");
          return fila;
        },
      };
    },

    guardarHashes(objeto) {
      const p = resolve(dir, "hashes.json");
      const previo = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
      writeFileSync(p, JSON.stringify({ ...previo, ...objeto }, null, 2) + "\n", "utf8");
      return p;
    },
  };
}

/** Resumen para consola: cuántos ok/falla/parcial/pendiente. */
export function resumir(dir) {
  const filas = JSON.parse(readFileSync(resolve(dir, "pasos.json"), "utf8"));
  const cuenta = filas.reduce((acc, f) => {
    acc[f.resultado] = (acc[f.resultado] ?? 0) + 1;
    return acc;
  }, {});
  return { total: filas.length, ...cuenta };
}
