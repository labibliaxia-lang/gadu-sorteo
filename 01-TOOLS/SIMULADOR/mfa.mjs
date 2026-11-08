#!/usr/bin/env node
/**
 * Segundo factor (TOTP) para las cuentas sintéticas.
 *
 * POR QUÉ: `app/admin/layout.tsx:36-49` exige `aal2` cuando
 * `ADMIN_MFA_REQUIRED=true`. Una sesión normal (`aal1`) se redirige a
 * /seguridad y nunca llega al panel. Sin esto, Carla no puede organizar nada.
 *
 * Qué hace: enrola un factor TOTP por API (el mismo que enrolaría a mano),
 * calcula el código de 6 dígitos con HMAC-SHA1 y lo verifica. La sesión que
 * devuelve ya está en `aal2`.
 *
 * El secreto queda en `.mfa-secrets.json` (ignorado por git) para poder volver
 * a entrar en la misma corrida.
 */

import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { crearClientePublico } from "./session.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ARCHIVO = resolve(RAIZ, ".mfa-secrets.json");

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decodificar(texto) {
  const limpio = texto.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let valor = 0;
  const salida = [];
  for (const caracter of limpio) {
    const indice = ALFABETO.indexOf(caracter);
    if (indice === -1) throw new Error(`base32 inválido: ${caracter}`);
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      salida.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(salida);
}

/** TOTP RFC 6238: 30 s, 6 dígitos, SHA-1. */
export function calcularTotp(secretoBase32, ahora = Date.now(), paso = 30) {
  const clave = base32Decodificar(secretoBase32);
  const contador = Math.floor(ahora / 1000 / paso);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(contador));

  const hmac = createHmac("sha1", clave).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const codigo =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(codigo % 1_000_000).padStart(6, "0");
}

const leerSecretos = () => (existsSync(ARCHIVO) ? JSON.parse(readFileSync(ARCHIVO, "utf8")) : {});
const guardarSecretos = (obj) => writeFileSync(ARCHIVO, JSON.stringify(obj, null, 2), "utf8");

/**
 * Devuelve una sesión en `aal2` para el email dado, enrolando TOTP si hace falta.
 */
export async function asegurarAal2(vars, { email, password }) {
  const cliente = crearClientePublico(vars);

  const { data: entrada, error: errorLogin } = await cliente.auth.signInWithPassword({ email, password });
  if (errorLogin) throw new Error(`login ${email}: ${errorLogin.message}`);
  if (!entrada.session) throw new Error(`sin sesión para ${email}`);

  const { data: factores, error: errorFactores } = await cliente.auth.mfa.listFactors();
  if (errorFactores) throw new Error(`listFactors: ${errorFactores.message}`);

  const totp = (factores?.totp ?? []);
  const verificado = totp.find((f) => f.status === "verified");
  const secretoGuardado = leerSecretos()[email];
  let factorId = verificado?.id;
  let secreto = secretoGuardado;

  if (!factorId) {
    // Limpio factores sin verificar que hayan quedado de intentos anteriores.
    for (const f of totp.filter((x) => x.status !== "verified")) {
      await cliente.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
    }

    const { data: alta, error: errorAlta } = await cliente.auth.mfa.enroll({ factorType: "totp" });
    if (errorAlta) throw new Error(`enroll: ${errorAlta.message}`);
    factorId = alta.id;
    secreto = alta.totp.secret;

    const secretos = leerSecretos();
    secretos[email] = secreto;
    guardarSecretos(secretos);
  }

  if (!secreto) {
    throw new Error(
      `el factor ${factorId} ya existe pero no tengo su secreto; borralo desde /seguridad y reintentá`,
    );
  }

  const { data: desafio, error: errorDesafio } = await cliente.auth.mfa.challenge({ factorId });
  if (errorDesafio) throw new Error(`challenge: ${errorDesafio.message}`);

  const { data: verificadoOk, error: errorVerify } = await cliente.auth.mfa.verify({
    factorId,
    challengeId: desafio.id,
    code: calcularTotp(secreto),
  });
  if (errorVerify) throw new Error(`verify: ${errorVerify.message}`);

  const { data: nivel } = await cliente.auth.mfa.getAuthenticatorAssuranceLevel();

  return {
    session: verificadoOk,
    secreto,
    factorId,
    nivel: nivel?.currentLevel ?? "?",
  };
}
