#!/usr/bin/env node
/**
 * Verifica en la web desplegada dos arreglos, sin tocar sorteos existentes:
 *
 *   B12 — un sorteo sin WhatsApp avisa arriba de la grilla y no deja reservar.
 *   B6  — el verificador corre SOLO al abrir, sin apretar «Comprobar».
 *
 * Para B6 crea un sorteo temporal ya sorteado con hashes calculados por este
 * mismo script, y lo borra al terminar.
 *
 * Uso: node verificar-b6-b12.mjs --acepto-produccion
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = resolve(RAIZ, "02-DOCS/wiki/ftd/evidencia/2026-11-05-b6-b12-verificado");
mkdirSync(DIR, { recursive: true });
const BASE = "https://gadu-sorteo-doci.vercel.app";

const vars = {};
for (const l of readFileSync(resolve(RAIZ, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = l.trim().match(/^([A-Za-z_0-9]+)\s*=\s*(.*)$/);
  if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
if (!process.argv.includes("--acepto-produccion")) {
  throw new Error("Requiere --acepto-produccion");
}

const admin = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------- hashes
const DOMINIO = "gadu:v1";
const sha = (t) => createHash("sha256").update(t, "utf8").digest("hex");

function calcular(raffleId, seed, numeros) {
  const lista = [...numeros].sort((a, b) => a - b).join(",");
  const commitment = sha(`${DOMINIO}|raffle:${raffleId}|seed:${seed}`);
  const numbersHash = sha(`${DOMINIO}|raffle:${raffleId}|numbers:${lista}`);
  const pick = sha(`${DOMINIO}|raffle:${raffleId}|seed:${seed}|numbers:${lista}`);
  const idx = Number(BigInt(`0x${pick.slice(0, 15)}`) % BigInt(numeros.length));
  const ganador = [...numeros].sort((a, b) => a - b)[idx];
  const resultHash = sha(`${DOMINIO}|raffle:${raffleId}|winner:${ganador}|numbers:${lista}`);
  return { commitment, numbersHash, resultHash, ganador };
}

const pasos = [];
const anotar = (paso, ok, detalle) => {
  pasos.push({ paso, resultado: ok ? "ok" : "falla", detalle });
  console.log(`${ok ? "ok  " : "FALLA"} ${paso} — ${detalle}`);
};

let sorteoId = null;

try {
  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await contexto.newPage();

  // ---------------------------------------------------------------- B12
  const { data: sinWa } = await admin
    .from("raffles")
    .select("id,title,whatsapp_contact")
    .eq("status", "active")
    .is("whatsapp_contact", null)
    .limit(1);

  if (sinWa && sinWa.length > 0) {
    const r = sinWa[0];
    await page.goto(`${BASE}/sorteos/${r.id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const aviso = await page.getByText(/no se puede comprar/i).first();
    const hayAviso = (await aviso.count()) > 0;
    await page.screenshot({ path: resolve(DIR, "b12-sorteo-sin-cobro.png"), fullPage: true });

    // el botón de reservar no debe existir habilitado
    const boton = page.getByRole("button", { name: /Reservar y enviar comprobante/i }).first();
    const existe = (await boton.count()) > 0;
    const deshabilitado = existe ? await boton.isDisabled() : true;

    anotar(
      "B12-aviso-visible",
      hayAviso,
      hayAviso ? `«${r.title}» muestra el aviso arriba de la grilla` : "no aparece el aviso",
    );
    anotar(
      "B12-reservar-deshabilitado",
      deshabilitado,
      existe ? `botón reservar deshabilitado=${deshabilitado}` : "no hay botón de reservar",
    );
  } else {
    anotar("B12-aviso-visible", false, "no encontré un sorteo activo sin WhatsApp");
  }

  // ---------------------------------------------------------------- B6
  const seedFija = "0123456789abcdef".repeat(4);
  const vendidos = [3, 7, 10];

  const { data: nuevo, error: e1 } = await admin
    .from("raffles")
    .insert({
      title: "VERIFICACION B6 — SE BORRA",
      description: "Sorteo temporal para comprobar que el verificador corre solo.",
      draw_date: new Date(Date.now() - 3600_000).toISOString(),
      price_per_number: 100,
      status: "active",
      whatsapp_contact: "5491155550101",
      transfer_alias: "prueba.b6",
    })
    .select("id")
    .single();
  if (e1) throw new Error(`insert raffle: ${e1.message}`);
  sorteoId = nuevo.id;

  await admin.from("raffle_numbers").insert(vendidos.map((n) => ({ raffle_id: sorteoId, number: n })));
  await admin
    .from("raffle_numbers")
    .update({ status: "sold", sold_at: new Date().toISOString() })
    .eq("raffle_id", sorteoId)
    .in("number", vendidos);

  const h = calcular(sorteoId, seedFija, vendidos);
  const { error: e2 } = await admin
    .from("raffles")
    .update({
      status: "drawn",
      draw_commitment: h.commitment,
      draw_commitment_at: new Date(Date.now() - 3600_000).toISOString(),
      draw_seed: seedFija,
      draw_seed_revealed_at: new Date().toISOString(),
      numbers_hash: h.numbersHash,
      result_hash: h.resultHash,
      winner_number: h.ganador,
      winner_name: "Verificación B6",
      drawn_at: new Date().toISOString(),
    })
    .eq("id", sorteoId);
  if (e2) throw new Error(`update raffle: ${e2.message}`);

  await page.goto(`${BASE}/sorteos/${sorteoId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  // Sin tocar ningún botón: si el verificador corre solo, el texto aparece igual.
  await page.waitForTimeout(5000);

  const texto = await page.locator("body").innerText();
  const verificado = /Verificado/i.test(texto);
  const coincidencias = (texto.match(/^\s*La |^\s*El /gm) ?? []).length;
  await page.screenshot({ path: resolve(DIR, "b6-verificador-automatico.png"), fullPage: true });

  anotar(
    "B6-corre-sin-click",
    verificado,
    verificado
      ? "el verificador muestra «Verificado» sin apretar Comprobar"
      : "sigue necesitando el clic",
  );

  // Control: si el listado se altera, debe delatarlo (el verificador no es decorativo)
  await page.getByLabel(/Listado de números vendidos/i).fill("3, 7, 99");
  await page.getByRole("button", { name: /Comprobar/i }).first().click();
  await page.waitForTimeout(3000);
  const textoAlterado = await page.locator("body").innerText();
  const delata = /no coincide|Algo no coincide/i.test(textoAlterado);
  await page.screenshot({ path: resolve(DIR, "b6-verificador-delata-manipulacion.png"), fullPage: true });
  anotar("B6-delata-listado-alterado", delata, delata ? "con 99 en vez de 10 avisa que no coincide" : "no avisó");

  await navegador.close();
  writeFileSync(resolve(DIR, "verificacion.json"), JSON.stringify({ pasos, hashes: h, vendidos }, null, 2), "utf8");
} finally {
  if (sorteoId) {
    await admin.from("raffle_numbers").delete().eq("raffle_id", sorteoId);
    await admin.from("raffles").delete().eq("id", sorteoId);
  }
  const { data: quedan } = await admin.from("raffles").select("id,title").ilike("title", "VERIFICACION B6%");
  console.log(`limpieza: sorteos temporales restantes=${quedan?.length ?? 0}`);
  const fallas = pasos.filter((p) => p.resultado !== "ok").length;
  process.exitCode = fallas === 0 ? 0 : 2;
}
