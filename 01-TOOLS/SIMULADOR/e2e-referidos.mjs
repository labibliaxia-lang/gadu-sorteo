#!/usr/bin/env node
/**
 * E2E de referidos («Invitá y Ganá») con sesión inyectada.
 *
 * POR QUÉ EXISTE: la app sólo deja entrar con Google o passkey, así que un
 * comprador sintético no puede autenticarse por UI. Este script usa la misma
 * intervención de laboratorio que `session.mjs`: crea la cuenta por Admin API,
 * hace `signInWithPassword` y deja la cookie de sesión en el navegador.
 *
 * QUÉ HACE, EN ORDEN (`--stage`):
 *   setup    crea organizador e invitado sintéticos y deja sus perfiles listos
 *   crear    crea sorteo principal y bonus por la UI real, como el organizador
 *   comprar  el invitado abre el enlace ?ref= y compra 2 números
 *   aprobar  el organizador aprueba la reserva desde /admin/notificaciones
 *   verificar consulta en base: referrals, números y premio
 *
 * La configuración de referidos se escribe con service_role porque **no hay UI
 * de administración para esos campos** (0102). Eso queda anotado como
 * intervención de laboratorio en la evidencia; el resto del recorrido es UI.
 *
 * Seguridad: las claves no se imprimen nunca. Sólo corre contra localhost.
 *
 * Uso: node e2e-referidos.mjs --stage setup|crear|comprar|aprobar|verificar|todo
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import pg from "pg";

import { crearCorrida } from "./evidence.mjs";
import { asegurarUsuario, crearAdmin, obtenerSesion, inyectarSesion } from "./session.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const argEnv = process.argv.find((a) => a.startsWith("--env-file="));
const ENV_FILE = argEnv?.split("=")[1] ?? process.env.SIM_ENV_FILE ?? ".env.local";
const BASE = process.env.SIM_BASE ?? "http://localhost:3001";
const PASSWORD = process.env.SIM_PASSWORD ?? "LaboratorioE2E-2026!";
// `--fresh` crea cuentas nuevas por corrida: un vínculo ya premiado no se puede
// volver a premiar (unique + rewarded), así que el veredicto necesita par nuevo.
const FRESH = process.argv.includes("--fresh");
const SUFIJO = FRESH ? `+${Date.now()}` : "";
const EMAIL_ORG = `e2e.organizador${SUFIJO}@gadu.test`;
const EMAIL_INV = `e2e.invitado${SUFIJO}@gadu.test`;

const stageIdx = process.argv.indexOf("--stage");
const STAGE = stageIdx > -1 ? process.argv[stageIdx + 1] : "todo";

const corrida = crearCorrida("-e2e-referidos", { reiniciar: STAGE === "setup" });
const capturas = (nombre) => resolve(corrida.capturas, `${nombre}.png`);

const ARCHIVO_ESTADO = resolve(corrida.dir, "estado.json");
const emailDe = (rol) => {
  const guardado = leerEstado();
  return (
    (rol === "org" ? guardado.emailOrg : guardado.emailInv) ??
    (rol === "org" ? EMAIL_ORG : EMAIL_INV)
  );
};
const leerEstado = () => {
  try {
    return JSON.parse(readFileSync(ARCHIVO_ESTADO, "utf8"));
  } catch {
    return {};
  }
};
const guardarEstado = (parcial) => {
  const previo = leerEstado();
  writeFileSync(ARCHIVO_ESTADO, JSON.stringify({ ...previo, ...parcial }, null, 2) + "\n", "utf8");
};

const leerEnv = (archivo) => {
  const vars = {};
  for (const linea of readFileSync(resolve(RAIZ, archivo), "utf8").split(/\r?\n/)) {
    const m = linea.trim().match(/^([A-Za-z_0-9]+)\s*=\s*(.*)$/);
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return vars;
};

const env = leerEnv(ENV_FILE);
const REF_PROYECTO = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const tokenGestion = leerEnv(".env.secrets.local").SUPABASE_ACCESS_TOKEN ?? "";

if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    `BLOQUEO: ${ENV_FILE} no tiene NEXT_PUBLIC_SUPABASE_ANON_KEY ni SUPABASE_SERVICE_ROLE_KEY. ` +
      "Completalas con Project Settings → API del proyecto de staging.",
  );
}
if (REF_PROYECTO === "mjgcoeikcyzwojbqtuah" && !process.env.SIM_ACEPTO_PRODUCCION) {
  throw new Error(
    "BLOQUEO: el E2E apunta al proyecto de PRODUCCIÓN. Usá --env-file=.env.test.local",
  );
}

/**
 * La `SUPABASE_SERVICE_ROLE_KEY` del .env.local está vencida (devuelve 401).
 * La clave vigente se pide a la API de gestión en memoria y no se imprime.
 */
async function claves() {
  if (env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ")) {
    return { ...env, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY };
  }
  if (!tokenGestion) {
    throw new Error("falta SUPABASE_ACCESS_TOKEN en .env.secrets.local para pedir la service key");
  }
  const respuesta = await fetch(`https://api.supabase.com/v1/projects/${REF_PROYECTO}/api-keys`, {
    headers: { Authorization: `Bearer ${tokenGestion}` },
  });
  if (!respuesta.ok) throw new Error(`api-keys: HTTP ${respuesta.status}`);
  const lista = await respuesta.json();
  const servicio = lista.find((k) => k.type === "legacy" && k.name === "service_role");
  if (!servicio?.api_key) throw new Error("no encontré la clave service_role en api-keys");
  return {
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_URL: BASE,
    SUPABASE_SERVICE_ROLE_KEY: servicio.api_key,
  };
}

const vars = await claves();
const admin = crearAdmin(vars);

const evidencia = (paso, { esperado, observado, resultado, archivos = [], nota = null }) => {
  const fila = corrida.abrir({ paso, rol: "e2e", esperado });
  fila.cerrar({ observado, resultado, evidencia: archivos, nota });
};

/** Crea o reutiliza las dos cuentas y deja los perfiles listos. */
async function prepararCuentas() {
  const org = await asegurarUsuario(admin, {
    email: EMAIL_ORG,
    password: PASSWORD,
    metadata: { full_name: "E2E Organizador", simulated: true },
  });
  const inv = await asegurarUsuario(admin, {
    email: EMAIL_INV,
    password: PASSWORD,
    metadata: { full_name: "E2E Invitado", simulated: true },
  });

  const columnas = await admin.from("profiles").select("*").eq("id", org.id).maybeSingle();
  if (columnas.error) throw new Error(`perfil organizador: ${columnas.error.message}`);

  // 0110: el plan free limita la cantidad de sorteos; este laboratorio necesita 2.
  // 0054: el trigger `enforce_organizer_kyc` exige identidad aprobada + datos
  // personales completos; la UI además pide DNI y dirección cargados.
  const { error: e1 } = await admin
    .from("profiles")
    .update({
      role: "admin",
      full_name: "E2E Organizador",
      verification_status: "approved",
      plan: "premium",
      phone: "+5491155550199",
      location: "CABA, Argentina",
      dni_number: "30111222",
      dni_address: "Av. Siempreviva 742",
      address_line: "Av. Siempreviva 742",
      city: "Buenos Aires",
      province: "CABA",
      postal_code: "1000",
      country: "Argentina",
      terms_accepted_at: new Date().toISOString(),
      terms_version: "1.0",
    })
    .eq("id", org.id);
  if (e1) throw new Error(`profiles organizador: ${e1.message}`);

  const { error: e2 } = await admin
    .from("profiles")
    .update({
      full_name: "E2E Invitado",
      phone: "+5491155550198",
      terms_accepted_at: new Date().toISOString(),
      terms_version: "1.0",
    })
    .eq("id", inv.id);
  if (e2) throw new Error(`profiles invitado: ${e2.message}`);

  return {
    orgId: org.id,
    invId: inv.id,
    orgCreado: org.creado,
    invCreado: inv.creado,
    // Con --fresh el email lleva sufijo: las etapas siguientes lo leen del estado.
    emailOrg: EMAIL_ORG,
    emailInv: EMAIL_INV,
  };
}

/** Abre un contexto con la sesión inyectada. */
async function contextoConSesion(navegador, email) {
  const sesion = await obtenerSesion(vars, { email, password: PASSWORD });
  const contexto = await navegador.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
  });
  await inyectarSesion(contexto, vars, sesion);
  return { contexto, sesion };
}

/** Marca la casilla cuyo texto de etiqueta coincide con el patrón. */
async function marcarCasillaPorTexto(page, patron) {
  const casillas = page.locator('input[type="checkbox"]');
  const total = await casillas.count();
  for (let i = 0; i < total; i += 1) {
    const casilla = casillas.nth(i);
    if (!(await casilla.isVisible())) continue;
    const etiqueta = await casilla.evaluate((el) => {
      const id = el.id;
      const porFor = id ? (document.querySelector(`label[for="${id}"]`)?.innerText ?? "") : "";
      return [
        el.closest("label")?.innerText ?? "",
        porFor,
        el.getAttribute("aria-label") ?? "",
        el.parentElement?.innerText ?? "",
      ]
        .join(" ")
        .slice(0, 240);
    });
    if (patron.test(etiqueta)) {
      // el.click() dispara el onChange que React necesita; `check()` sobre un
      // input oculto (sr-only) lo marca en el DOM pero no actualiza el estado.
      await casilla.evaluate((el) => el.click());
      return true;
    }
  }
  return false;
}

/** Crea un sorteo por el wizard real del panel. Devuelve su id. */
async function crearSorteo(page, { titulo, numeros }) {
  await page.goto(`${BASE}/admin/sorteos/nuevo`, { waitUntil: "load" });
  await page.waitForTimeout(1500);

  // Portón de Términos y Condiciones de la cuenta (0113/0050).
  const aceptarTerminos = page.getByRole("button", { name: /aceptar versi[oó]n|aceptar y continuar/i }).first();
  if (await aceptarTerminos.count()) {
    await marcarCasillaPorTexto(page, /he le[ií]do|t[eé]rminos/i);
    await aceptarTerminos.click().catch(() => {});
    await page.waitForTimeout(2000);
  }

  // Gate de perfil incompleto (teléfono/dirección) si aparece.
  const gate = page.locator("#gate-phone");
  if (await gate.count()) {
    await gate.fill("+5491155550199");
    for (const [id, valor] of Object.entries({
      "gate-address": "Av. Siempreviva 742",
      "gate-city": "Buenos Aires",
      "gate-province": "CABA",
      "gate-postal": "1000",
      "gate-country": "Argentina",
    })) {
      const campo = page.locator(`#${id}`);
      if (await campo.count()) await campo.fill(valor);
    }
    const seguir = page.getByRole("button", { name: /guardar|continuar|siguiente/i }).first();
    if (await seguir.count()) await seguir.click();
    await page.waitForTimeout(1500);
  }

  await page.locator("#title").fill(titulo);
  await page.locator("#description").fill("Sorteo del E2E de referidos. No participar.");
  await page.locator("#price_per_number").fill("10");

  const manana = new Date(Date.now() + 3 * 24 * 3600 * 1000);
  const fecha = new Date(manana.getTime() - manana.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await page.locator("#draw_date").fill(fecha);

  for (const [id, valor] of Object.entries({ max_numbers: String(numeros), min_tickets_required: "1", winners_count: "1" })) {
    const campo = page.locator(`#${id}`);
    if (await campo.count()) await campo.fill(valor);
  }

  const select = page.locator("#if_not_met");
  if (await select.count()) {
    const valores = await select.locator("option").evaluateAll((os) => os.map((o) => o.value));
    if (valores.length) await select.selectOption(valores[0]);
  }

  await page.getByRole("button", { name: /^Continuar$/i }).click();
  await page.waitForTimeout(2500);

  // Corrección 2026-11-07: se elige «transferencia» por valor, no por posición.
  // El plan de prueba (premium) habilita los dos métodos y el radio «último» no
  // es estable entre planes; el cobro manual es el que usa este escenario.
  const transferencia = page.locator('input[name="payment_type"][value="transferencia"]');
  if (await transferencia.count()) {
    await transferencia.first().check({ force: true });
  } else {
    await page.locator('input[name="payment_type"][type="radio"]').last().check();
  }
  await page.locator("#transfer_alias").fill("e2e.referidos");
  await page.locator("#transfer_cbu").fill("0000003100010000000001");
  await page.locator("#transfer_bank").fill("Banco de Prueba");
  await page.locator("#whatsapp_contact").fill("+5491155550199");

  await page.getByRole("button", { name: /^Continuar$/i }).click();
  await page.waitForTimeout(2500);

  // El wizard tiene pasos variables (portada, revisión). Se avanza hasta que
  // aparezca el botón final; si no aparece, se corta y se reporta la pantalla.
  for (let i = 0; i < 4; i += 1) {
    if (await page.getByRole("button", { name: /crear sorteo/i }).count()) break;
    const continuar = page.getByRole("button", { name: /^Continuar$/i }).first();
    if (!(await continuar.count())) break;
    await continuar.click();
    await page.waitForTimeout(2500);
  }

  if (!(await page.getByRole("button", { name: /crear sorteo/i }).count())) {
    const botones = await page
      .locator("button")
      .evaluateAll((bs) =>
        bs
          .map((b) => ({ t: (b.textContent ?? "").trim().slice(0, 40), d: b.disabled }))
          .filter((b) => b.t),
      );
    const campos = await page.locator("input,select,textarea").evaluateAll((es) =>
      es.map((e) => ({ id: e.id, tipo: e.type ?? e.tagName, req: e.required })).filter((e) => e.id),
    );
    console.error(`[crear] botones: ${JSON.stringify(botones)}`);
    console.error(`[crear] campos: ${JSON.stringify(campos)}`);
  }

  // Bases legales del sorteo: sin esta casilla el botón de crear rechaza (0113).
  await marcarCasillaPorTexto(page, /bases legales|acepto y publico/i);

  // 0079: no publicar en el listado. El E2E no ensucia la cartelera.
  const casilla = page.locator('input[name="is_listed"]').first();
  if (await casilla.count()) {
    try {
      await casilla.check();
    } catch {
      /* si ya viene marcada, sigue */
    }
  }

  await page.getByRole("button", { name: /crear sorteo/i }).first().click();
  await page.waitForTimeout(9000);

  const url = page.url();
  const m = url.match(/\/admin\/sorteos\/([0-9a-f-]{36})/i);
  if (!m) {
    await page.screenshot({ path: capturas("err-crear"), fullPage: true });
    const texto = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const alertas = await page
      .locator('[role="alert"], .text-destructive, [data-sonner-toast], .text-red-500, .text-red-600, [class*="destructive"]')
      .evaluateAll((es) => es.map((e) => (e.textContent ?? "").trim().slice(0, 200)).filter(Boolean));
    const checks = await page
      .locator('input[type="checkbox"]')
      .evaluateAll((es) => es.map((e) => ({ id: e.id, marcado: e.checked })));
    console.error(`[crear] quedó en ${url}. Pantalla: ${texto.slice(0, 900)}`);
    console.error(`[crear] alertas: ${JSON.stringify(alertas)}`);
    console.error(`[crear] checkboxes: ${JSON.stringify(checks)}`);
    throw new Error(`no pude leer el id del sorteo creado. url: ${url}`);
  }
  return m[1];
}

async function main() {
  const navegador = await chromium.launch({ headless: true });

  try {
    // ---------------------------------------------------------------- setup
    if (STAGE === "setup" || STAGE === "todo") {
      const cuentas = await prepararCuentas();
      guardarEstado(cuentas);
      console.log(JSON.stringify(cuentas));
      evidencia("setup-cuentas", {
        esperado: "organizador admin con KYC aprobado e invitado normal",
        observado: `organizador ${cuentas.orgId.slice(0, 8)} (creado=${cuentas.orgCreado}), invitado ${cuentas.invId.slice(0, 8)} (creado=${cuentas.invCreado})`,
        resultado: "ok",
        archivos: [],
        nota: "laboratorio: cuentas sintéticas por Admin API + profiles por service_role (no hay alta por UI)",
      });

      if (STAGE === "todo") {
        await faseCrear(navegador, cuentas);
        await faseComprar(navegador, cuentas);
        await faseAprobar(navegador);
        await fasePremio();
        await faseVerificar();
      }
    } else if (STAGE === "crear") {
      await faseCrear(navegador);
    } else if (STAGE === "comprar") {
      await faseComprar(navegador);
    } else if (STAGE === "aprobar") {
      await faseAprobar(navegador);
    } else if (STAGE === "premio") {
      await fasePremio();
    } else if (STAGE === "verificar") {
      await faseVerificar();
    }
  } finally {
    await navegador.close();
  }
}

/**
 * Consulta SQL contra la base del entorno elegido.
 *
 * Si el archivo de entorno trae DATABASE_URL (caso staging), se usa `pg`
 * directo: el token de gestión no tiene permiso sobre ese proyecto (403).
 * Si no, se cae a la API de gestión del proyecto.
 */
let pgClient = null;

async function sql(consulta) {
  if (env.DATABASE_URL) {
    if (!pgClient) {
      pgClient = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
      await pgClient.connect();
    }
    const resultado = await pgClient.query(consulta);
    return resultado.rows;
  }

  const respuesta = await fetch(
    `https://api.supabase.com/v1/projects/${REF_PROYECTO}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenGestion}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: consulta }),
    },
  );
  if (!respuesta.ok) throw new Error(`sql HTTP ${respuesta.status}: ${(await respuesta.text()).slice(0, 200)}`);
  return respuesta.json();
}

/** UUID seguro para interpolar en SQL (vienen de la base, no del usuario). */
const uuid = (valor) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(valor))) throw new Error(`uuid inválido: ${valor}`);
  return valor;
};

async function sorteoPorId(id) {
  const filas = await sql(`select * from public.raffles where id = '${uuid(id)}'`);
  return filas[0];
}

async function referidosDe(id) {
  const filas = await sql(
    `select * from public.referrals where referred_id = '${uuid(id)}' order by created_at desc limit 5`,
  );
  return filas ?? [];
}

async function numerosDe(raffleId) {
  const filas = await sql(
    `select * from public.raffle_numbers where raffle_id = '${uuid(raffleId)}' order by number`,
  );
  return filas ?? [];
}

async function faseCrear(navegador, cuentas = {}) {
  const { orgId, invId } = cuentas.orgId ? cuentas : await prepararCuentas();
  const { contexto } = await contextoConSesion(navegador, emailDe("org"));
  const page = await contexto.newPage();

  const principalId = await crearSorteo(page, { titulo: "E2E Referidos — principal", numeros: 20 });
  await page.screenshot({ path: capturas("01-principal-creado"), fullPage: true });
  const bonusId = await crearSorteo(page, { titulo: "E2E Referidos — bonus", numeros: 50 });
  await page.screenshot({ path: capturas("02-bonus-creado"), fullPage: true });

  // Configuración de referidos: no hay UI (0102), va por service_role.
  const { error } = await admin
    .from("raffles")
    .update({
      referral_enabled: true,
      referral_min_numbers: 2,
      referral_require_buyer_min: 0,
      referral_max_per_user: 3,
      bonus_raffle_id: bonusId,
      is_listed: false,
    })
    .eq("id", principalId);
  if (error) throw new Error(`config referidos: ${error.message}`);
  await admin.from("raffles").update({ is_listed: false }).eq("id", bonusId);

  const principal = await sorteoPorId(principalId);
  evidencia("crear-sorteos", {
    esperado: "principal y bonus activos, referidos habilitados con mínimo 2 y tope 3",
    observado: `principal ${principal.slug} (${principalId.slice(0, 8)}) con bonus ${bonusId.slice(0, 8)}; referral_enabled=${principal.referral_enabled}, min=${principal.referral_min_numbers}, max=${principal.referral_max_per_user}`,
    resultado: "ok",
    archivos: ["capturas/01-principal-creado.png", "capturas/02-bonus-creado.png"],
    nota: `laboratorio: referral_* y bonus_raffle_id escritos por service_role; no existe UI de administración. organizador=${orgId.slice(0, 8)} invitado=${invId.slice(0, 8)}`,
  });

  console.log(JSON.stringify({ principalId, bonusId, slug: principal.slug }));
  guardarEstado({ orgId, invId, principalId, bonusId, slug: principal.slug });
  await contexto.close();
  return { principalId, bonusId, slug: principal.slug, orgId, invId };
}

async function faseComprar(navegador) {
  const estado = leerEstado();
  const principal = estado.principalId
    ? await sorteoPorId(estado.principalId)
    : null;
  if (!principal) throw new Error("no hay sorteo principal en el estado: corré --stage crear primero");
  const orgId = estado.orgId;

  const { contexto } = await contextoConSesion(navegador, emailDe("inv"));
  const page = await contexto.newPage();
  const errores = [];
  page.on("console", (m) => {
    if (m.type() === "error") errores.push(m.text().slice(0, 200));
  });

  const enlace = `${BASE}/sorteos/${principal.slug}?ref=${orgId}`;
  await page.goto(enlace, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: capturas("03-invitado-enlace"), fullPage: true });

  // Vínculo de referido creado por ReferralCapture al cargar con ?ref=
  let vinculo = estado.invId ? await referidosDe(estado.invId) : [];
  let fila = vinculo[0];

  // HALLAZGO: `referrals` no tiene GRANT INSERT para `authenticated` (ni
  // políticas): el POST de ReferralCapture vuelve 403 y el vínculo no se crea.
  // Para poder probar la recompensa se puentea el insert por SQL y se marca.
  if (!fila && estado.invId && orgId) {
    await sql(
      `insert into public.referrals (referrer_id, referred_id) values ('${uuid(orgId)}','${uuid(estado.invId)}') on conflict do nothing`,
    );
    vinculo = await referidosDe(estado.invId);
    fila = vinculo[0];
  }

  evidencia("enlace-capturado", {
    esperado: "una fila en referrals con el invitado y rewarded=false",
    observado: fila
      ? `referrals: referente ${String(fila.referrer_id).slice(0, 8)} → invitado ${String(fila.referred_id).slice(0, 8)}, rewarded=${fila.rewarded}`
      : "sin fila: el INSERT anónimo fue rechazado",
    resultado: fila ? "ok" : "falla",
    archivos: ["capturas/03-invitado-enlace.png"],
    nota: `laboratorio: el insert de ReferralCapture devuelve 403 (falta GRANT INSERT en public.referrals); el vínculo se creó por SQL para poder probar la recompensa. enlace: /sorteos/${principal.slug}?ref=<organizador>`,
  });

  // Elegir 2 números disponibles en la grilla.
  const numeros = page.locator('[data-number]:not([disabled])');
  const libres = await numeros.count();
  if (libres < 2) throw new Error(`no hay números disponibles para comprar (encontrados: ${libres})`);

  const elegidos = [];
  for (let i = 0; i < 2; i += 1) {
    const boton = numeros.nth(i);
    await boton.click();
    elegidos.push((await boton.getAttribute("data-number")) ?? String(i));
  }
  await page.screenshot({ path: capturas("04-numeros-elegidos"), fullPage: true });

  // Aceptar bases legales: el portón de 0113 bloquea el botón de reserva.
  const casillas = page.locator('input[type="checkbox"]');
  const cuantas = await casillas.count();
  for (let i = 0; i < cuantas; i += 1) {
    const casilla = casillas.nth(i);
    if (!(await casilla.isVisible())) continue;
    const etiqueta = await casilla.evaluate((el) => {
      const texto = el.closest("label")?.innerText ?? "";
      const propio = el.getAttribute("aria-label") ?? "";
      const id = el.id;
      const ref = id ? (document.querySelector(`label[for="${id}"]`)?.innerText ?? "") : "";
      return (texto || propio || ref || el.parentElement?.innerText || "").slice(0, 160);
    });
    if (/acepto|t[eé]rminos|condiciones|bases legales/i.test(etiqueta)) {
      await casilla.check({ force: true }).catch(() => {});
    }
  }

  const reservar = page.getByRole("button", { name: /reservar/i }).first();
  await reservar.click();
  await page.waitForTimeout(2500);

  // 0113: el portón de bases legales aparece DESPUÉS de apretar Reservar.
  const aceptar = page.getByRole("button", { name: /aceptar y continuar/i }).first();
  if (await aceptar.count()) {
    await marcarCasillaPorTexto(page, /he le[íi]do|acepto/i);
    await aceptar.click();
    await page.waitForTimeout(3500);
  }

  // Segundo portón: datos de entrega del premio (dirección del comprador).
  const guardarReserva = page.getByRole("button", { name: /guardar y reservar/i }).first();
  if (await guardarReserva.count()) {
    const campos = [
      [/tel[eé]fono/i, "+5491155550198"],
      [/direcci[oó]n/i, "Av. Siempreviva 742"],
      [/ciudad/i, "Buenos Aires"],
      [/provincia/i, "CABA"],
      [/c[oó]digo postal/i, "1000"],
      [/pa[ií]s/i, "AR"],
    ];
    for (const [patron, valor] of campos) {
      const campo = page.getByLabel(patron).first();
      if (await campo.count()) await campo.fill(valor).catch(() => {});
    }
    await guardarReserva.click();
    await page.waitForTimeout(5000);
  }
  await page.screenshot({ path: capturas("05-tras-reservar"), fullPage: true });

  const texto = (await page.locator("body").innerText()).slice(0, 600);
  const numerosDb = await numerosDe(principal.id);
  const delInvitado = numerosDb.filter(
    (n) => estado.invId && (n.reserved_by === estado.invId || n.sold_to === estado.invId),
  );
  const pagos = await sql(
    `select id, status, amount from public.payments where user_id = '${uuid(estado.invId)}' order by created_at desc limit 3`,
  ).catch(() => []);

  evidencia("compra", {
    esperado: "2 números reservados por el invitado y pago pendiente",
    observado: `elegidos=${elegidos.join(",")}; del invitado=${delInvitado.length} (${delInvitado.map((n) => `${n.number}:${n.status}`).join(", ")}); pagos=${pagos.length ? pagos.map((p) => `${p.status}:${p.amount}`).join(",") : "ninguno"}; pantalla: ${texto.replace(/\s+/g, " ").slice(0, 140)}`,
    resultado: delInvitado.length >= 2 ? "ok" : "falla",
    archivos: ["capturas/04-numeros-elegidos.png", "capturas/05-tras-reservar.png"],
    nota: errores.length ? `consola: ${errores.slice(0, 3).join(" | ")}` : null,
  });

  console.log(
    JSON.stringify({
      enlace,
      elegidos,
      delInvitado: delInvitado.map((n) => ({ numero: n.number, estado: n.status })),
      pagos: pagos.map((p) => p.status),
      errores: errores.slice(0, 5),
    }),
  );
  await contexto.close();
}

async function faseAprobar(navegador) {
  const estado = leerEstado();
  const { contexto } = await contextoConSesion(navegador, emailDe("org"));
  const page = await contexto.newPage();
  await page.goto(`${BASE}/admin/notificaciones`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: capturas("06-notificaciones"), fullPage: true });

  const aprobar = page.getByRole("button", { name: /^aprobar$/i }).first();
  const hay = await aprobar.count();
  if (hay) {
    await aprobar.click();
    await page.waitForTimeout(5000);
  }
  await page.screenshot({ path: capturas("07-tras-aprobar"), fullPage: true });

  const numeros = estado.principalId ? await numerosDe(estado.principalId) : [];
  const vendidos = numeros.filter((n) => estado.invId && n.sold_to === estado.invId);
  const referidos = estado.invId ? await referidosDe(estado.invId) : [];
  const premiado = referidos.find((r) => r.rewarded);

  evidencia("aprobacion", {
    esperado: "la reserva pasa a vendida y reward_referral premia el vínculo",
    observado: `boton=${hay ? "sí" : "no"}; números vendidos al invitado=${vendidos.map((n) => n.number).join(",") || "ninguno"}; rewarded=${premiado ? `${premiado.rewarded} num=${premiado.rewarded_number}` : "sin premio"}`,
    resultado: hay && vendidos.length ? "ok" : "falla",
    archivos: ["capturas/06-notificaciones.png", "capturas/07-tras-aprobar.png"],
  });

  console.log(JSON.stringify({ boton: hay, vendidos: vendidos.map((n) => n.number), rewarded: premiado?.rewarded ?? false, numeroPremio: premiado?.rewarded_number ?? null }));
  await contexto.close();
}

/**
 * Otorga el premio llamando exactamente la misma RPC que usa la aprobación
 * (`app/admin/notificaciones/actions.ts` → `premiarReferidos`).
 *
 * Por qué hace falta este paso aparte: el sorteo bonus queda en `paused` al
 * crearse (el plan premium permite un sorteo activo), y `reward_referral`
 * exige destino `active`/`closed`. Se activa el bonus y se reintenta la RPC,
 * que es idempotente.
 */
async function fasePremio() {
  const estado = leerEstado();
  const principal = await sorteoPorId(estado.principalId);
  const bonus = principal.bonus_raffle_id ? await sorteoPorId(principal.bonus_raffle_id) : null;

  if (bonus && bonus.status === "paused") {
    await sql(`update public.raffles set status = 'active' where id = '${uuid(bonus.id)}'`);
  }

  const pendientes = (await referidosDe(estado.invId)).filter((r) => !r.rewarded);
  let resultado = null;
  if (pendientes.length) {
    const respuesta = await fetch(`${vars.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/reward_referral`, {
      method: "POST",
      headers: {
        apikey: vars.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${vars.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_referral_id: pendientes[0].id, p_raffle_id: principal.id }),
    });
    resultado = await respuesta.json();
  }

  const [rel] = await referidosDe(estado.invId);
  const origen = rel?.rewarded_raffle_id
    ? (
        await sql(
          `select origin, status, sold_to, number from public.raffle_numbers where raffle_id = '${uuid(rel.rewarded_raffle_id)}' and number = ${Number(rel.rewarded_number)}`,
        )
      )[0]
    : null;

  evidencia("premio", {
    esperado: "rewarded=true y un número del bonus con origin='premio' vendido al referente",
    observado: rel?.rewarded
      ? `bonus ${bonus?.status}; rpc=${JSON.stringify(resultado)}; rewarded_number=${rel.rewarded_number}; origen=${origen?.origin}; estado=${origen?.status}; sold_to=${String(origen?.sold_to ?? "").slice(0, 8)}`
      : `sin premio. bonus status=${bonus?.status}; rpc=${JSON.stringify(resultado)}`,
    resultado: rel?.rewarded && origen?.origin === "premio" ? "ok" : "falla",
    archivos: [],
    nota: bonus?.status === "paused" || resultado !== null ? "laboratorio: el bonus se creó en paused (límite de plan) y se activó por SQL antes de reintentar la RPC idempotente" : null,
  });

  console.log(
    JSON.stringify({
      bonus: bonus?.status,
      rpc: resultado,
      rewarded: rel?.rewarded ?? false,
      numero: rel?.rewarded_number ?? null,
      origen: origen?.origin ?? null,
    }),
  );
}

async function faseVerificar() {
  const estado = leerEstado();
  const filas = estado.invId ? await referidosDe(estado.invId) : [];
  const premiado = filas.find((r) => r.rewarded);
  const numerosVendidos = estado.principalId
    ? (await numerosDe(estado.principalId)).filter(
        (n) => n.sold_to === estado.invId && n.status === "sold",
      )
    : [];
  const premio = premiado?.rewarded_raffle_id
    ? await numerosDe(premiado.rewarded_raffle_id)
    : [];
  const numeroPremio = premio.find(
    (n) => n.number === premiado?.rewarded_number && n.origin === "premio",
  );

  evidencia("verificacion", {
    esperado: "rewarded=true, número premio con origin='premio' y vendido al referente",
    observado: premiado
      ? `rewarded=${premiado.rewarded}; via=${String(premiado.rewarded_via_raffle_id).slice(0, 8)}; bonus=${String(premiado.rewarded_raffle_id).slice(0, 8)}; numero=${premiado.rewarded_number}; origin=${numeroPremio?.origin ?? "—"}; sold_to=${String(numeroPremio?.sold_to ?? "—").slice(0, 8)}`
      : "ninguna fila de referrals quedó premiada",
    resultado: premiado && numeroPremio ? "ok" : "falla",
    archivos: [],
  });

  console.log(
    JSON.stringify(
      {
        referrals: filas.length,
        premiado: Boolean(premiado),
        numeroPremio: numeroPremio
          ? { numero: numeroPremio.number, origin: numeroPremio.origin, status: numeroPremio.status }
          : null,
        vendidosInvitado: numerosVendidos.length,
      },
      null,
      2,
    ),
  );
}

// `pg` mantiene vivo el event loop: se cierra al terminar para que el proceso
// salga solo (si no, el runner queda colgado aunque el escenario haya pasado).
try {
  await main();
} finally {
  if (pgClient) await pgClient.end().catch(() => {});
}

