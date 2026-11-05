#!/usr/bin/env node
/**
 * Verifica B4 en la web desplegada, sin escribir en los sorteos reales.
 *
 * Qué comprueba:
 *   1. un usuario logueado SIN dirección puede abrir un sorteo y ver la grilla
 *      (antes, un modal le tapaba todo);
 *   2. al apretar «Reservar» la app le pide la dirección en ese momento.
 *
 * El paso 2 corta ANTES de llamar a la RPC de reserva, así que no reserva nada.
 * Crea una cuenta temporal y la borra al final.
 *
 * Uso: node verificar-b4.mjs --acepto-produccion
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = resolve(RAIZ, "02-DOCS/wiki/ftd/evidencia/2026-11-05-b4-verificado");
mkdirSync(DIR, { recursive: true });

const leerEnv = (archivo) => {
  const ruta = resolve(RAIZ, archivo);
  if (!existsSync(ruta)) throw new Error(`no existe ${archivo}`);
  const vars = {};
  for (const l of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const m = l.trim().match(/^([A-Za-z_0-9]+)\s*=\s*(.*)$/);
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return vars;
};

if (!process.argv.includes("--acepto-produccion")) {
  throw new Error("Requiere --acepto-produccion: crea y borra una cuenta en la base real.");
}

const vars = leerEnv(".env.local");
const base = "https://gadu-sorteo-doci.vercel.app";
const EMAIL = "b4verif@gadu.test";
const PASSWORD = `B4-${Date.now()}-Aa1!`;

const admin = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let userId = null;
const pasos = [];
const anotar = (paso, ok, detalle) => {
  pasos.push({ paso, resultado: ok ? "ok" : "falla", detalle });
  console.log(`${ok ? "ok  " : "FALLA"} ${paso} — ${detalle}`);
};

try {
  // 0. un sorteo activo con WhatsApp cargado y números disponibles (sólo lectura).
  // Hace falta WhatsApp: sin él, NumbersGrid corta antes de llegar al chequeo de
  // dirección y la prueba daría un falso negativo.
  const { data: candidatos } = await admin
    .from("raffles")
    .select("id,title,status,whatsapp_contact")
    .eq("status", "active")
    .not("whatsapp_contact", "is", null);
  let sorteo = null;
  for (const c of candidatos ?? []) {
    const { count } = await admin
      .from("raffle_numbers")
      .select("*", { count: "exact", head: true })
      .eq("raffle_id", c.id)
      .eq("status", "available");
    if ((count ?? 0) > 0) {
      sorteo = c;
      break;
    }
  }
  if (!sorteo) throw new Error("no encontré un sorteo activo con WhatsApp y números libres");
  console.log(`sorteo de prueba (sólo lectura): ${sorteo.title} ${sorteo.id}`);

  // 1. cuenta temporal SIN dirección
  const { data: alta, error: e1 } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: "Verificación B4",
      accepted_terms: "true",
      terms_version: "1.0",
    },
  });
  if (e1) throw new Error(`createUser: ${e1.message}`);
  userId = alta.user.id;

  const { data: perfil } = await admin
    .from("profiles")
    .select("phone,address_line,city,province,postal_code")
    .eq("id", userId)
    .single();
  const sinDireccion = !perfil?.address_line;
  anotar("precondicion-sin-direccion", sinDireccion, JSON.stringify(perfil));

  // 2. sesión e inyección de cookie
  const cliente = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: entrada, error: e2 } = await cliente.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (e2) throw new Error(`login: ${e2.message}`);

  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1000 } });
  const ref = new URL(vars.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  await contexto.addCookies([
    {
      name: `sb-${ref}-auth-token`,
      value: JSON.stringify(entrada.session),
      url: base,
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    },
  ]);
  const page = await contexto.newPage();

  // 3. la grilla se puede ver: NO aparece el modal bloqueante
  await page.goto(`${base}/sorteos/${sorteo.id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const modalBloqueante = await page.locator("#delivery-gate-title").count();
  await page.screenshot({ path: resolve(DIR, "b4-1-grilla-sin-modal.png"), fullPage: true });
  anotar(
    "grilla-sin-modal-bloqueante",
    modalBloqueante === 0,
    modalBloqueante === 0
      ? "el modal de dirección ya no tapa la página del sorteo"
      : "el modal bloqueante sigue apareciendo al entrar",
  );

  // 4. la grilla responde a un clic (antes el modal interceptaba todo)
  const celda = page.locator('[data-number]:not([disabled])').first();
  const hayCelda = (await celda.count()) > 0;
  if (hayCelda) await celda.click({ timeout: 15000 });
  anotar("grilla-clicable", hayCelda, hayCelda ? "se puede elegir un número" : "no encontré números disponibles");

  // 5. al reservar sin dirección, pide la dirección AHORA
  const boton = page.getByRole("button", { name: /Reservar y enviar comprobante/i }).first();
  await boton.click({ timeout: 15000 });
  const dialogo = page.locator("#direccion-reserva-title");
  const aparece = await dialogo
    .waitFor({ state: "visible", timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  const numeroElegido = hayCelda ? await celda.getAttribute("data-number") : null;
  await page.screenshot({ path: resolve(DIR, "b4-2-pide-direccion-al-reservar.png"), fullPage: true });
  anotar(
    "pide-direccion-al-reservar",
    aparece,
    aparece
      ? "aparece el diálogo ¿A dónde te mandamos el premio? antes de reservar"
      : "no apareció el diálogo de dirección",
  );

  // 6. no se reservó nada
  if (numeroElegido) {
    const { data: fila } = await admin
      .from("raffle_numbers")
      .select("number,status")
      .eq("raffle_id", sorteo.id)
      .eq("number", Number(numeroElegido))
      .maybeSingle();
    anotar(
      "no-escribio-en-el-sorteo",
      fila?.status === "available",
      `el número ${numeroElegido} sigue en ${fila?.status}`,
    );
  }

  // 7. se puede descartar
  await page.getByRole("button", { name: /Ahora no/i }).first().click().catch(() => {});
  const cerrado = (await page.locator("#direccion-reserva-title").count()) === 0;
  anotar("se-puede-descartar", cerrado, cerrado ? "«Ahora no» cierra el diálogo" : "el diálogo quedó abierto");

  await navegador.close();
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
  const { data: quedan } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const resto = (quedan?.users ?? []).filter((u) => u.email === EMAIL).length;
  console.log(`limpieza: cuenta borrada=${resto === 0}`);
  writeFileSync(resolve(DIR, "verificacion.json"), JSON.stringify({ pasos, limpieza: { cuentaBorrada: resto === 0 } }, null, 2), "utf8");
  const fallas = pasos.filter((p) => p.resultado !== "ok").length;
  process.exitCode = fallas === 0 ? 0 : 2;
}
