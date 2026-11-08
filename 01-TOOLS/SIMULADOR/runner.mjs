#!/usr/bin/env node
/**
 * Runner de escenarios A, B, C, D y F sobre el navegador real.
 *
 * Reglas que respeta:
 *  - sólo corre si `env-guard` confirma que la base es de prueba;
 *  - cada paso deja captura y fila en `pasos.json`;
 *  - si un selector no aparece, el paso queda `falla` con captura y DOM, no se
 *    saltea en silencio;
 *  - la service_role se usa para crear cuentas, leer estado y las
 *    intervenciones de laboratorio. Nunca para hacer el trabajo del usuario.
 *
 * Uso: node runner.mjs A|B|C|D|F [--sorteo <uuid>]
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

import { cargarEnvTest, REF_PRODUCCION } from "./env-guard.mjs";
import { crearCorrida, resumir } from "./evidence.mjs";
import {
  asegurarUsuario,
  crearAdmin,
  obtenerSesion,
  inyectarSesion,
} from "./session.mjs";
import { asegurarAal2 } from "./mfa.mjs";
import { CUENTAS } from "./seed.mjs";
import { verificar, verificarMulti, comparar } from "./verify-hash.mjs";

/** Textos de la UI, todos verificados en el código. */
const T = {
  reservar: "Reservar y enviar comprobante",
  reservando: "Reservando…",
  modalTitulo: "Reserva confirmada",
  whatsapp: "Enviar comprobante por WhatsApp",
  cerrar: "Cerrar",
  comprobanteRecibido: "Comprobante recibido",
  marcarPagado: "Marcar como pagado",
  reservasEsperando: "Reservas esperando pago",
  publicarCompromiso: "Publicar compromiso",
};

// ------------------------------------------------------------------ utilidades

const iso = () => new Date().toISOString();

async function capturar(page, corrida, nombre) {
  const ruta = resolve(corrida.capturas, `${nombre}.png`);
  await page.screenshot({ path: ruta, fullPage: true });
  return `capturas/${nombre}.png`;
}

/** Saca el texto visible del body, recortado, para dejar constancia del estado. */
async function vistazo(page, max = 1200) {
  const texto = (await page.locator("body").innerText().catch(() => "")) ?? "";
  return texto.replace(/\n{2,}/g, "\n").slice(0, max);
}

async function sesion(browser, vars, cuenta, rol) {
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // El panel exige aal2 (app/admin/layout.tsx:36-49): sólo el organizador
  // necesita el segundo factor. Los compradores entran con sesión normal.
  const s =
    cuenta.rol === "admin"
      ? (await asegurarAal2(vars, { email: cuenta.email, password: vars.SIM_PASSWORD })).session
      : await obtenerSesion(vars, { email: cuenta.email, password: vars.SIM_PASSWORD });
  await inyectarSesion(contexto, vars, s);
  const page = await contexto.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.error(`  [${rol}] console: ${m.text()}`);
  });
  return { contexto, page };
}

async function ir(page, vars, ruta) {
  const base = vars.NEXT_PUBLIC_URL ?? "http://localhost:3000";
  const t0 = Date.now();
  const respuesta = await page.goto(`${base}${ruta}`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  return { ms: Date.now() - t0, status: respuesta?.status() ?? null };
}

/**
 * El modal `delivery-gate` (components/ProfileCompletionGate.tsx) aparece antes
 * de poder reservar o crear: pide teléfono y dirección completa. Bloquea los
 * clics de todo lo que hay detrás, así que hay que pasarlo primero.
 */
async function pasarGateDireccion(page, telefono) {
  const gate = page.locator("#gate-phone");
  if ((await gate.count()) === 0) return false;

  const valores = {
    "gate-phone": telefono,
    "gate-address": "Av. Siempreviva 742",
    "gate-city": "Buenos Aires",
    "gate-province": "CABA",
    "gate-postal": "1000",
    "gate-country": "Argentina",
  };
  for (const [id, v] of Object.entries(valores)) {
    await page.locator(`#${id}`).fill(v).catch(() => {});
  }
  await page.getByRole("button", { name: /Guardar dirección y continuar/i }).click({ timeout: 15000 });
  await page.waitForTimeout(3500);
  return true;
}

/** Lee del DOM los números ya reservados/vendidos que muestra la grilla. */
async function estadoGrilla(page) {
  return page.evaluate(() => {
    const celdas = Array.from(document.querySelectorAll("[data-number], button"));
    const salida = { reserved: [], sold: [], tomados: [] };
    for (const c of celdas) {
      const n = c.getAttribute("data-number");
      if (!n) continue;
      const t = (c.getAttribute("title") ?? "") + " " + (c.textContent ?? "");
      const num = Number(n);
      if (/vendid/i.test(t)) salida.sold.push(num);
      else if (/reservad/i.test(t)) salida.reserved.push(num);
    }
    return salida;
  });
}

// ------------------------------------------------------------------ escenario A

async function escenarioA({ vars, admin, corrida, sorteo, numeros }) {
  const browser = await chromium.launch();
  const salida = {};

  try {
    // --- Ana abre el sorteo
    const ana = await sesion(browser, vars, CUENTAS[0], "ana");
    {
      const paso = corrida.abrir({
        paso: "A1-abrir-sorteo",
        rol: "ana",
        esperado: "el sorteo abre sin sesión, muestra precio, fecha y grilla",
      });
      const r = await ir(ana.page, vars, `/sorteos/${sorteo}`);
      const cap = await capturar(ana.page, corrida, "A1-grilla");
      salida.cargaMs = r.ms;
      const habiaGate = await pasarGateDireccion(ana.page, CUENTAS[0].telefono ?? "+5491155550101");
      if (habiaGate) await capturar(ana.page, corrida, "A1b-grilla-tras-gate");
      paso.cerrar({
        observado: `status ${r.status} en ${r.ms} ms. Modal de dirección al entrar: ${habiaGate}. Texto: ${(await vistazo(ana.page, 260)).replace(/\n/g, " · ")}`,
        resultado: r.status === 200 ? "ok" : "falla",
        evidencia: habiaGate ? [cap, "capturas/A1b-grilla-tras-gate.png"] : [cap],
        nota: habiaGate ? "el comprador no puede reservar sin cargar dirección completa: modal bloqueante" : null,
      });
    }

    // --- Ana elige 2 números y reserva
    {
      const paso = corrida.abrir({
        paso: "A2-reservar",
        rol: "ana",
        esperado: `los números ${numeros.join(" y ")} quedan reserved y el modal muestra el total`,
      });

      for (const n of numeros) {
        const celda = ana.page.locator(`[data-number="${n}"]`).first();
        const porTexto = ana.page.getByRole("button", { name: String(n), exact: true });
        const elegido = (await celda.count()) > 0 ? celda : porTexto;
        await elegido.click({ timeout: 10000 });
      }

      const t0 = Date.now();
      await ana.page.getByRole("button", { name: new RegExp(T.reservar, "i") }).first().click();
      const modal = ana.page.getByRole("dialog").filter({ hasText: T.modalTitulo });
      await modal.waitFor({ state: "visible", timeout: 20000 });
      const reservaMs = Date.now() - t0;

      const textoModal = await modal.innerText();
      const cap = await capturar(ana.page, corrida, "A2-reserva-confirmada");

      const wa = ana.page.getByRole("link", { name: new RegExp(T.whatsapp, "i") }).first();
      const href = (await wa.count()) > 0 ? await wa.getAttribute("href") : null;

      salida.reserva = { ms: reservaMs, textoModal, whatsappHref: href };

      paso.cerrar({
        observado: `modal en ${reservaMs} ms. Enlace WhatsApp: ${href ? "presente" : "AUSENTE"}`,
        resultado: href ? "ok" : "falla",
        evidencia: [cap],
        nota: href ? null : "sin enlace wa.me: el comprador no tiene cómo mandar el comprobante",
      });

      await ana.page.getByRole("button", { name: new RegExp(T.cerrar, "i") }).first().click().catch(() => {});
    }

    // --- Estado en la base, no en la pantalla
    {
      const paso = corrida.abrir({
        paso: "A3-estado-base",
        rol: "ana",
        esperado: "en raffle_numbers los 2 números están reserved con reserved_until futuro",
      });
      const { data, error } = await admin
        .from("raffle_numbers")
        .select("number,status,reserved_until,reserved_by")
        .eq("raffle_id", sorteo)
        .in("number", numeros);

      const todosReservados = !error && data?.every((r) => r.status === "reserved");
      salida.baseTrasReserva = data;

      paso.cerrar({
        observado: error
          ? `error: ${error.message}`
          : data.map((r) => `${r.number}:${r.status}:vence ${r.reserved_until}`).join(" | "),
        resultado: todosReservados ? "ok" : "falla",
        evidencia: ["hashes-no-aplica"],
        nota: "lectura por service_role; es inspección, no acción de usuario",
      });
    }

    // --- Carla confirma el pago
    const carla = await sesion(browser, vars, CUENTAS[3], "carla");
    {
      const paso = corrida.abrir({
        paso: "A4-confirmar-pago",
        rol: "carla",
        esperado: "el organizador tilda «Comprobante recibido» y marca pagado; pasan a sold",
      });

      const r = await ir(carla.page, vars, `/admin/sorteos/${sorteo}`);
      const panel = carla.page.locator("body").filter({ hasText: T.reservasEsperando });
      const hayPanel = (await panel.count()) > 0;

      await carla.page.getByLabel(new RegExp(T.comprobanteRecibido, "i")).first().check({ timeout: 15000 }).catch(() => {});
      const capAntes = await capturar(carla.page, corrida, "A4-antes-de-marcar");
      await carla.page.getByRole("button", { name: new RegExp(T.marcarPagado, "i") }).first().click({ timeout: 15000 }).catch(() => {});
      await carla.page.waitForTimeout(3000);
      const cap = await capturar(carla.page, corrida, "A4-despues-de-marcar");

      const { data } = await admin
        .from("raffle_numbers")
        .select("number,status,sold_to")
        .eq("raffle_id", sorteo)
        .in("number", numeros);
      const vendidos = data?.every((r) => r.status === "sold");
      salida.baseTrasPago = data;
      salida.cargaAdminMs = r.ms;

      paso.cerrar({
        observado: `panel presente: ${hayPanel}. En base: ${data?.map((r) => `${r.number}:${r.status}`).join(" | ")}`,
        resultado: vendidos ? "ok" : "falla",
        evidencia: [capAntes, cap],
      });
    }

    // --- Carla publica el compromiso y sortea
    {
      const paso = corrida.abrir({
        paso: "A5-compromiso-y-sorteo",
        rol: "carla",
        esperado: "compromiso publicado y sorteo ejecutado con semilla revelada",
      });

      const boton = carla.page.getByRole("button", { name: new RegExp(T.publicarCompromiso, "i") }).first();
      if ((await boton.count()) > 0) {
        await boton.click();
        await carla.page.waitForTimeout(4000);
      }
      const capCompromiso = await capturar(carla.page, corrida, "A5-compromiso");

      // El botón de sortear aparece una vez hay compromiso.
      const sortear = carla.page
        .getByRole("button", { name: /sortear|ejecutar sorteo|realizar sorteo/i })
        .first();
      const haySortear = (await sortear.count()) > 0;
      if (haySortear) {
        await sortear.click();
        await carla.page.waitForTimeout(6000);
      }
      const capSorteo = await capturar(carla.page, corrida, "A5-sorteo");

      const { data } = await admin
        .from("raffles")
        .select("status,draw_commitment,draw_seed,numbers_hash,result_hash,winner_number,drawn_at")
        .eq("id", sorteo)
        .single();
      salida.sorteo = data;

      paso.cerrar({
        observado: `botón sortear visible: ${haySortear}. Estado: ${data?.status}. Ganador: ${data?.winner_number ?? "—"}`,
        resultado: data?.status === "drawn" ? "ok" : "falla",
        evidencia: [capCompromiso, capSorteo],
        nota: haySortear ? null : "no encontré el botón de sortear; revisar el nombre accesible",
      });
    }

    // --- Diego verifica sin confiar en la pantalla
    {
      const paso = corrida.abrir({
        paso: "A6-verificar-independiente",
        rol: "diego",
        esperado: "mi recálculo coincide con lo publicado por la web",
      });

      const { data: vendidos } = await admin
        .from("raffle_numbers")
        .select("number")
        .eq("raffle_id", sorteo)
        .eq("status", "sold");
      const numbers = (vendidos ?? []).map((r) => r.number);

      const r = verificar({ raffleId: sorteo, seed: salida.sorteo.draw_seed, numbers });
      const publicado = {
        commitment: salida.sorteo.draw_commitment,
        numbersHash: salida.sorteo.numbers_hash,
        winner: salida.sorteo.winner_number,
        resultHash: salida.sorteo.result_hash,
      };
      const c = comparar(r, publicado);

      const diego = await sesion(browser, vars, CUENTAS[3], "diego");
      await ir(diego.page, vars, `/sorteos/${sorteo}`);
      const cap = await capturar(diego.page, corrida, "A6-verificador");
      const texto = await vistazo(diego.page, 800);
      const verdeEnPantalla = /coincide|✓|verificado/i.test(texto);

      salida.hashes = { recalculado: r, publicado, checks: c.checks };
      corrida.guardarHashes({
        sorteo,
        semilla: salida.sorteo.draw_seed,
        commitment: salida.sorteo.draw_commitment,
        numbersHash: salida.sorteo.numbers_hash,
        winner: salida.sorteo.winner_number,
        resultHash: salida.sorteo.result_hash,
        recalculadoPor: "verify-hash.mjs (node:crypto)",
        coincide: c.todosCoinciden,
      });

      paso.cerrar({
        observado: `${c.checks.filter((x) => x.coincide).length}/4 checks coinciden. Pantalla con señales de verificación: ${verdeEnPantalla}. Listado vendido: ${numbers.length} números`,
        resultado: c.todosCoinciden ? "ok" : "falla",
        evidencia: [cap],
      });
      await diego.contexto.close();
    }

    await ana.contexto.close();
    await carla.contexto.close();
  } finally {
    await browser.close();
  }

  return salida;
}

// ------------------------------------------------------------------ escenario B

async function escenarioB({ vars, admin, corrida, sorteo, numero }) {
  const browser = await chromium.launch();
  const gente = [CUENTAS[0], CUENTAS[1], CUENTAS[2]];
  const resultado = {};

  const paso = corrida.abrir({
    paso: "B1-reserva-concurrente",
    rol: "ana+bruno+eva",
    esperado: `uno solo se queda con el número ${numero}; los otros reciben rechazo claro`,
  });

  try {
    const sesiones = [];
    for (const cuenta of gente) sesiones.push(await sesion(browser, vars, cuenta, cuenta.id));

    // Todos en la misma página, mismo número, mismo instante.
    await Promise.all(sesiones.map((s) => ir(s.page, vars, `/sorteos/${sorteo}`)));
    for (let i = 0; i < sesiones.length; i += 1) {
      await pasarGateDireccion(sesiones[i].page, gente[i].telefono ?? `+54911555501${10 + i}`);
    }

    const t0 = Date.now();
    const intentos = await Promise.all(
      sesiones.map(async (s, i) => {
        const celda = s.page.locator(`[data-number="${numero}"]`).first();
        const porTexto = s.page.getByRole("button", { name: String(numero), exact: true });
        const elegido = (await celda.count()) > 0 ? celda : porTexto;
        await elegido.click({ timeout: 15000 }).catch(() => {});

        await s.page
          .getByRole("button", { name: new RegExp(T.reservar, "i") })
          .first()
          .click({ timeout: 15000 })
          .catch(() => {});

        const modal = s.page.getByRole("dialog").filter({ hasText: T.modalTitulo });
        const gano = await modal
          .waitFor({ state: "visible", timeout: 20000 })
          .then(() => true)
          .catch(() => false);
        const cap = await capturar(s.page, corrida, `B1-${gente[i].id}`);
        const texto = await vistazo(s.page, 500);
        return { persona: gente[i].id, gano, captura: cap, texto };
      }),
    );
    const ms = Date.now() - t0;

    const { data } = await admin
      .from("raffle_numbers")
      .select("number,status,reserved_by")
      .eq("raffle_id", sorteo)
      .eq("number", numero)
      .single();

    const ganadores = intentos.filter((i) => i.gano).length;
    resultado.intentos = intentos;
    resultado.filaFinal = data;
    resultado.ms = ms;

    paso.cerrar({
      observado: `${ganadores} de 3 vieron «Reserva confirmada» en ${ms} ms. Fila final: ${data?.status} reservado por ${data?.reserved_by ?? "nadie"}`,
      resultado: ganadores === 1 && data?.status === "reserved" ? "ok" : "falla",
      evidencia: intentos.map((i) => i.captura),
      nota: ganadores !== 1 ? "no hubo exactamente un ganador: revisar mensajes al perdedor" : null,
    });

    for (const s of sesiones) await s.contexto.close();
  } finally {
    await browser.close();
  }

  return resultado;
}

// ------------------------------------------------------------------ escenario C

async function escenarioC({ vars, admin, corrida, sorteo, numero }) {
  const browser = await chromium.launch();
  const salida = {};

  try {
    const bruno = await sesion(browser, vars, CUENTAS[1], "bruno");

    {
      const paso = corrida.abrir({
        paso: "C1-reservar-y-abandonar",
        rol: "bruno",
        esperado: "reserva creada, comprador cierra la pestaña sin mandar comprobante",
      });
      await ir(bruno.page, vars, `/sorteos/${sorteo}`);
      await pasarGateDireccion(bruno.page, CUENTAS[1].telefono ?? "+5491155550102");
      const celda = bruno.page.locator(`[data-number="${numero}"]`).first();
      const porTexto = bruno.page.getByRole("button", { name: String(numero), exact: true });
      await ((await celda.count()) > 0 ? celda : porTexto).click();
      await bruno.page.getByRole("button", { name: new RegExp(T.reservar, "i") }).first().click();
      await bruno.page.getByRole("dialog").filter({ hasText: T.modalTitulo }).waitFor({ timeout: 20000 });
      const cap = await capturar(bruno.page, corrida, "C1-reserva-antes-de-abandonar");

      const { data } = await admin
        .from("raffle_numbers")
        .select("number,status,reserved_until")
        .eq("raffle_id", sorteo)
        .eq("number", numero)
        .single();
      salida.reserva = data;

      const vence = data?.reserved_until ? new Date(data.reserved_until) : null;
      const horas = vence ? Math.round((vence - Date.now()) / 36e5) : null;

      paso.cerrar({
        observado: `estado ${data?.status}, vence en ${horas} h (${data?.reserved_until})`,
        resultado: data?.status === "reserved" ? "ok" : "falla",
        evidencia: [cap],
      });
    }

    // La pestaña se cierra: el abandono es real.
    await bruno.contexto.close();

    {
      const paso = corrida.abrir({
        paso: "C2-liberacion-automatica",
        rol: "sistema",
        esperado: "pasado el hold, el número vuelve a available sin intervención",
      });

      // INTERVENCIÓN DE LABORATORIO: no esperamos 48 h. Vencimos la fila en la
      // base de prueba para simular el paso del tiempo.
      const vencido = new Date(Date.now() - 60_000).toISOString();
      const { error: errVencido } = await admin
        .from("raffle_numbers")
        .update({ reserved_until: vencido })
        .eq("raffle_id", sorteo)
        .eq("number", numero);
      if (errVencido) throw new Error(`no pude vencer la reserva: ${errVencido.message}`);

      // Ahora miro si el sistema la libera solo. Se consulta la RPC real.
      const { data: tras, error } = await admin.rpc("release_expired_reservations");
      const { data: fila } = await admin
        .from("raffle_numbers")
        .select("number,status,reserved_until")
        .eq("raffle_id", sorteo)
        .eq("number", numero)
        .single();

      salida.liberacion = { rpc: tras, error: error?.message ?? null, fila };

      paso.cerrar({
        observado: `tras vencer la fila y llamar a release_expired_reservations: estado ${fila?.status}. RPC devolvió: ${JSON.stringify(tras)}${error ? ` (error: ${error.message})` : ""}`,
        resultado: fila?.status === "available" ? "ok" : "falla",
        evidencia: ["hashes-no-aplica"],
        nota: "laboratorio: reserved_until se forzó al pasado; llamada directa a la RPC que usa el cron",
      });
    }
  } finally {
    await browser.close();
  }

  return salida;
}

// ------------------------------------------------------------------ escenario D

async function escenarioD({ vars, admin, corrida, sorteo }) {
  const salida = {};

  const { data: sorteoFila } = await admin
    .from("raffles")
    .select("status,draw_commitment,draw_seed,numbers_hash,result_hash,winner_number")
    .eq("id", sorteo)
    .single();

  if (!sorteoFila?.draw_seed) {
    const paso = corrida.abrir({
      paso: "D1-precondicion",
      rol: "diego",
      esperado: "hay un sorteo ya sorteado con semilla revelada para manipular",
    });
    paso.cerrar({
      observado: `el sorteo ${sorteo} está en estado ${sorteoFila?.status ?? "?"} sin draw_seed`,
      resultado: "pendiente",
      evidencia: [],
      nota: "D depende de que A haya sorteado primero",
    });
    return salida;
  }

  const { data: vendidos } = await admin
    .from("raffle_numbers")
    .select("number")
    .eq("raffle_id", sorteo)
    .eq("status", "sold");
  const numbers = (vendidos ?? []).map((r) => r.number);

  {
    const paso = corrida.abrir({
      paso: "D1-verificacion-limpia",
      rol: "diego",
      esperado: "con los datos reales los 4 checks dan verde",
    });
    const r = verificar({ raffleId: sorteo, seed: sorteoFila.draw_seed, numbers });
    const c = comparar(r, {
      commitment: sorteoFila.draw_commitment,
      numbersHash: sorteoFila.numbers_hash,
      winner: sorteoFila.winner_number,
      resultHash: sorteoFila.result_hash,
    });
    salida.limpio = r;
    paso.cerrar({
      observado: `${c.checks.filter((x) => x.coincide).length}/4 coinciden`,
      resultado: c.todosCoinciden ? "ok" : "falla",
      evidencia: ["hashes.json"],
    });
  }

  {
    const paso = corrida.abrir({
      paso: "D2-manipulacion-detectada",
      rol: "diego",
      esperado: "cambiar un número vendido rompe numbersHash y el ganador recalculado",
    });

    // INTERVENCIÓN DE LABORATORIO: altero el listado en la base de prueba para
    // comprobar si el verificador lo delata. No se corrige después: es la prueba.
    const alterado = [...numbers];
    if (alterado.length > 0) alterado[0] = alterado[0] + 1000;

    const r = verificar({ raffleId: sorteo, seed: sorteoFila.draw_seed, numbers: alterado });
    const cambia = r.numbersHash !== sorteoFila.numbers_hash;
    const ganadorCambia = r.winner !== sorteoFila.winner_number;
    salida.manipulado = { alterado, r, cambia, ganadorCambia };

    paso.cerrar({
      observado: `numbersHash ${cambia ? "difiere" : "NO difiere"}; ganador ${sorteoFila.winner_number} → ${r.winner} (${ganadorCambia ? "cambia" : "igual"})`,
      resultado: cambia ? "ok" : "falla",
      evidencia: ["hashes.json"],
      nota: "laboratorio: listado alterado sólo en memoria del verificador, la base de prueba no se toca",
    });
  }

  {
    const paso = corrida.abrir({
      paso: "D3-semilla-alterada",
      rol: "diego",
      esperado: "cambiar la semilla rompe el compromiso publicado",
    });
    const r = verificar({ raffleId: sorteo, seed: "f".repeat(64), numbers });
    const rompe = r.commitment !== sorteoFila.draw_commitment;
    paso.cerrar({
      observado: `compromiso publicado ${String(sorteoFila.draw_commitment).slice(0, 12)}… vs recalculado con otra semilla ${r.commitment.slice(0, 12)}… → ${rompe ? "difiere" : "NO difiere"}`,
      resultado: rompe ? "ok" : "falla",
      evidencia: ["hashes.json"],
    });
  }

  return salida;
}

// ------------------------------------------------------------------ escenario F

/**
 * Escenario F — Full E2E.
 *
 * Recorre el negocio completo sobre staging:
 *   organizador crea sorteo bonus + principal multi-premio con «Invitá y Ganá»,
 *   jugador A entra por el enlace ?ref= y compra con prepago,
 *   jugador B compra sin referido,
 *   el organizador aprueba desde /admin/notificaciones,
 *   se verifica el número 🎁 del sorteo bonus,
 *   se sortea desde /en-vivo y se comprueban resultados y hashes.
 *
 * Reglas:
 *  - todo el recorrido de usuario es UI real con sesión inyectada;
 *  - service_role sólo prepara cuentas/perfiles y lee estado (se declara);
 *  - la única intervención de laboratorio sobre el sorteo es mover draw_date al
 *    pasado después de publicar el compromiso (el motor exige fecha cumplida);
 *  - cada paso deja captura o JSON en la carpeta de evidencia.
 */

const REF_STAGING = "dolxvoxyespguvixhkku";
const F_IGNORAR_CONSOLA = [
  /favicon/i,
  /Download the React DevTools/i,
  /ResizeObserver loop/i,
  /net::ERR_ABORTED/i,
  /WebSocket connection/i,
  /\[Fast Refresh\]/i,
];

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera hasta que `fn()` devuelva algo truthy. Devuelve null si vence. */
async function esperarHasta(fn, { timeout = 15000, interval = 500 } = {}) {
  const limite = Date.now() + timeout;
  let ultimoError = null;
  while (Date.now() < limite) {
    try {
      const valor = await fn();
      if (valor) return valor;
    } catch (error) {
      ultimoError = error;
    }
    await dormir(interval);
  }
  if (ultimoError) console.error(`  [espera] ${ultimoError.message}`);
  return null;
}

async function vistazoF(page, max = 900) {
  const texto = (await page.locator("body").innerText().catch(() => "")) ?? "";
  return texto.replace(/\n{2,}/g, "\n").slice(0, max);
}

/** Contexto con sesión inyectada; `aal2` sólo para el panel del organizador. */
async function nuevaSesionF(browser, vars, { email, password, rol, aal2 = false }) {
  const contexto = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
  });
  const sesionCruda = aal2
    ? (await asegurarAal2(vars, { email, password })).session
    : await obtenerSesion(vars, { email, password });
  await inyectarSesion(contexto, vars, sesionCruda);
  const page = await contexto.newPage();
  const errores = [];
  page.on("console", (m) => {
    if (m.type() === "error") errores.push(m.text().slice(0, 400));
  });
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`.slice(0, 400)));
  return { contexto, page, errores, rol };
}

/** Contexto público sin cookie de sesión (para resultados/verificación). */
async function nuevoContextoAnonimo(browser, rol) {
  const contexto = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
  });
  const page = await contexto.newPage();
  const errores = [];
  page.on("console", (m) => {
    if (m.type() === "error") errores.push(m.text().slice(0, 400));
  });
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`.slice(0, 400)));
  return { contexto, page, errores, rol };
}

async function irF(page, vars, ruta) {
  const base = vars.NEXT_PUBLIC_URL ?? "http://localhost:3000";
  const respuesta = await page.goto(`${base}${ruta}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  return { status: respuesta?.status() ?? null, url: page.url() };
}

/** Marca una casilla buscando el texto de su etiqueta (React necesita click real). */
async function marcarPorEtiquetaF(page, patron) {
  const casillas = page.locator('input[type="checkbox"]');
  const total = await casillas.count();
  for (let i = 0; i < total; i += 1) {
    const casilla = casillas.nth(i);
    if (!(await casilla.isVisible().catch(() => false))) continue;
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
      // `check()` evita el doble toggle que produce `el.click()` cuando el
      // input está envuelto por su <label> (el click burbujea y React pierde
      // el estado). Con force se tolera el input visualmente pequeño.
      await casilla.check({ force: true }).catch(async () => {
        await casilla.evaluate((el) => el.click());
      });
      return true;
    }
  }
  return false;
}

function fechaLocalF(dias = 3) {
  const fecha = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  return new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

async function crearCuentaF(admin, vars, { email, nombre, rol, telefono, kyc = false }) {
  const { id, creado } = await asegurarUsuario(admin, {
    email,
    password: vars.SIM_PASSWORD,
    metadata: { full_name: nombre, simulated: true },
  });

  // El trigger de alta crea la fila de profiles; puede tardar un instante.
  const perfilExiste = await esperarHasta(
    async () => {
      const { data } = await admin.from("profiles").select("id").eq("id", id).maybeSingle();
      return Boolean(data);
    },
    { timeout: 10000 },
  );
  if (!perfilExiste) throw new Error(`no apareció el perfil de ${email}`);

  const perfil = {
    full_name: nombre,
    phone: telefono,
    location: "CABA, Argentina",
    address_line: "Av. Siempreviva 742",
    city: "Buenos Aires",
    province: "CABA",
    postal_code: "1000",
    country: "Argentina",
    terms_accepted_at: new Date().toISOString(),
    terms_version: "1.0",
  };

  if (kyc) {
    Object.assign(perfil, {
      role: "admin",
      plan: "premium",
      verification_status: "approved",
      dni_number: "30111222",
      dni_address: "Av. Siempreviva 742",
    });
  }

  const { error } = await admin.from("profiles").update(perfil).eq("id", id);
  if (error) throw new Error(`profiles ${email}: ${error.message}`);

  return { id, creado, email, nombre, rol, telefono };
}

/** Crea un sorteo por el wizard real. Devuelve el UUID. */
async function crearSorteoF(page, vars, opciones, admin = null) {
  const base = vars.NEXT_PUBLIC_URL ?? "http://localhost:3000";
  const {
    titulo,
    descripcion = "Sorteo E2E Full. No participar.",
    maxNumbers,
    winnersCount,
    precio = 10,
    dias = 3,
    referral = false,
    referralMin = 2,
    referralMax = 1,
    bonusId = null,
  } = opciones;

  await page.goto(`${base}/admin/sorteos/nuevo`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.locator("#title").waitFor({ state: "visible", timeout: 60000 });

  // Portón de términos de la cuenta del organizador (0113/0050).
  const aceptarTerminos = page
    .getByRole("button", { name: /aceptar versi[oó]n|aceptar y continuar/i })
    .first();
  if (await aceptarTerminos.count()) {
    await marcarPorEtiquetaF(page, /he le[ií]do|t[eé]rminos/i);
    await aceptarTerminos.click().catch(() => {});
    await page.waitForTimeout(2000);
  }

  // Gate de perfil incompleto (teléfono/dirección), si aparece.
  if (await page.locator("#gate-phone").count()) {
    for (const [id, valor] of Object.entries({
      "gate-phone": "+5491155550201",
      "gate-address": "Av. Siempreviva 742",
      "gate-city": "Buenos Aires",
      "gate-province": "CABA",
      "gate-postal": "1000",
      "gate-country": "Argentina",
    })) {
      await page.locator(`#${id}`).fill(valor).catch(() => {});
    }
    await page
      .getByRole("button", { name: /Guardar dirección y continuar/i })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(2000);
  }

  await page.locator("#title").fill(titulo);
  await page.locator("#description").fill(descripcion);
  await page.locator("#price_per_number").fill(String(precio));
  await page.locator("#draw_date").fill(fechaLocalF(dias));
  await page.locator("#max_numbers").fill(String(maxNumbers));
  await page.locator("#min_tickets_required").fill("0");
  await page.locator("#winners_count").fill(String(winnersCount));
  const selectSiNo = page.locator("#if_not_met");
  if (await selectSiNo.count()) {
    const valores = await selectSiNo
      .locator("option")
      .evaluateAll((opciones) => opciones.map((o) => o.value));
    if (valores.length) await selectSiNo.selectOption(valores[0]);
  }

  await page.getByRole("button", { name: /^Continuar$/i }).click();
  await page.waitForTimeout(2000);
  if (!(await page.locator("#transfer_alias").count())) {
    throw new Error(`el wizard no avanzó al paso 2. Pantalla: ${await vistazoF(page, 500)}`);
  }

  const transferencia = page.locator('input[name="payment_type"][value="transferencia"]');
  if (await transferencia.count()) {
    await transferencia.first().check({ force: true });
  } else {
    await page.locator('input[name="payment_type"][type="radio"]').last().check();
  }
  await page.locator("#transfer_alias").fill("e2e.full");
  await page.locator("#transfer_cbu").fill("0000003100010000000001");
  await page.locator("#transfer_bank").fill("Banco de Prueba");
  await page.locator("#whatsapp_contact").fill("+5491155550201");

  await page.getByRole("button", { name: /^Continuar$/i }).click();
  await page.waitForTimeout(2000);
  if (!(await page.locator("#referral_enabled").count())) {
    throw new Error(`el wizard no avanzó al paso 3. Pantalla: ${await vistazoF(page, 500)}`);
  }

  // Bases legales: obligatorias desde 0113.
  const terminos = page.getByLabel(/acepto publicar estos t[eé]rminos/i).first();
  if (await terminos.count()) {
    await terminos.check({ force: true });
  } else {
    await marcarPorEtiquetaF(page, /acepto publicar estos t[eé]rminos/i);
  }
  await page.waitForTimeout(500);

  // 0079: no publicar en la cartelera (sigue abriendo por enlace).
  const noListado = page.locator('input[name="no_listado"]').first();
  if (await noListado.count()) await noListado.check({ force: true }).catch(() => {});
  await page.waitForTimeout(300);

  if (referral) {
    const referralCheck = page.locator("#referral_enabled");
    await referralCheck.check({ force: true });
    await page.waitForTimeout(400);
    await page.locator("#referral_min_numbers").fill(String(referralMin));
    await page.locator("#referral_max_per_user").fill(String(referralMax));
    if (bonusId) {
      await page.locator("#bonus_raffle_id").selectOption(bonusId);
    }
  }

  await page.getByRole("button", { name: /crear sorteo/i }).first().click();

  // El alta es un INSERT + RPC desde el navegador y recién después el router
  // navega al detalle. En dev la primera compilación del detalle puede tardar;
  // esperamos la URL hasta 60 s y, si aun así no llegó, buscamos por título
  // único en la base (el sorteo ya se creó: sólo falta leer el id).
  await page
    .waitForURL(
      (url) => /\/admin\/sorteos\/[0-9a-f-]{36}/i.test(url.pathname),
      { timeout: 60000 },
    )
    .catch(() => {});
  await page.waitForTimeout(1000);

  let url = page.url();
  let m = url.match(/\/admin\/sorteos\/([0-9a-f-]{36})/i);
  if (!m && admin) {
    const { data } = await admin
      .from("raffles")
      .select("id")
      .eq("title", titulo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) m = [null, data.id];
  }
  if (!m) {
    url = page.url();
    const alertas = await page
      .locator('[role="alert"], .text-destructive, [data-sonner-toast], .text-red-500, [class*="destructive"]')
      .evaluateAll((elementos) =>
        elementos.map((e) => (e.textContent ?? "").trim().slice(0, 300)).filter(Boolean),
      );
    const casillas = await page
      .locator('input[type="checkbox"]')
      .evaluateAll((elementos) =>
        elementos.map((e) => ({
          id: e.id,
          marcado: e.checked,
          etiqueta: (e.closest("label")?.innerText ?? "").trim().slice(0, 120),
        })),
      );
    throw new Error(
      `no se creó el sorteo. url=${url}; pantalla=${(await vistazoF(page, 2600)).replace(/\n/g, " · ")}; alertas=${JSON.stringify(alertas)}; casillas=${JSON.stringify(casillas)}`,
    );
  }
  return m[1];
}

async function agregarPremiosF(page, vars, raffleId, premios) {
  const base = vars.NEXT_PUBLIC_URL ?? "http://localhost:3000";
  await page.goto(`${base}/admin/sorteos/${raffleId}/premios`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.locator("#position").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(1200);

  for (const premio of premios) {
    await page.locator("#position").fill(String(premio.position));
    await page.locator("#title").fill(premio.title);
    if (await page.locator("#description").count()) {
      await page.locator("#description").fill(premio.description ?? "");
    }
    const agregar = page.getByRole("button", { name: /agregar premio/i }).first();
    const boton =
      (await agregar.count()) > 0
        ? agregar
        : page.locator("button").filter({ hasText: /Agregar premio/i }).first();
    await boton.waitFor({ state: "visible", timeout: 30000 });
    await boton.click();
    await page
      .getByText(/Premio agregado/i)
      .first()
      .waitFor({ timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(1000);
  }
}

/**
 * Configura «Invitá y Ganá» desde la pantalla de edición.
 *
 * Hace falta porque el wizard de alta muestra los campos pero su INSERT no los
 * persiste (ver F3). La edición sí pasa por `updateRaffle`, que los guarda.
 */
async function configurarReferidosF(page, vars, admin, raffleId, { min = 2, max = 1, bonusId }) {
  const base = vars.NEXT_PUBLIC_URL ?? "http://localhost:3000";
  await page.goto(`${base}/admin/sorteos/${raffleId}/editar`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.locator("#referral_enabled").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);

  await page.locator("#referral_enabled").check({ force: true });
  await page.waitForTimeout(400);
  await page.locator("#referral_min_numbers").fill(String(min));
  await page.locator("#referral_max_per_user").fill(String(max));
  await page
    .locator(`#bonus_raffle_id option[value="${bonusId}"]`)
    .waitFor({ state: "attached", timeout: 15000 });
  await page.locator("#bonus_raffle_id").selectOption(bonusId);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: /Guardar cambios/i }).first().click();

  const fila = await esperarHasta(
    async () => {
      const { data } = await admin
        .from("raffles")
        .select(
          "id, slug, title, status, winners_count, referral_enabled, referral_min_numbers, referral_max_per_user, bonus_raffle_id, is_listed",
        )
        .eq("id", raffleId)
        .maybeSingle();
      return data?.referral_enabled === true &&
        data?.referral_min_numbers === min &&
        data?.referral_max_per_user === max &&
        data?.bonus_raffle_id === bonusId
        ? data
        : null;
    },
    { timeout: 20000 },
  );

  if (!fila) {
    const error = await page
      .locator('[role="alert"], .text-destructive')
      .first()
      .innerText()
      .catch(() => "");
    throw new Error(`la edición no guardó la configuración de referidos${error ? `: ${error}` : ""}`);
  }
  return fila;
}

async function publicarCompromisoF(page, vars, admin, raffleId, corrida) {
  const base = vars.NEXT_PUBLIC_URL ?? "http://localhost:3000";
  await page.goto(`${base}/admin/sorteos/${raffleId}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  // La tarjeta de pasos se hidrata después del SSR: si se hace clic antes,
  // el botón existe en el DOM pero no tiene handler de React.
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const boton = page.getByRole("button", { name: /^Publicar compromiso$/i }).first();
  const alternativo = page
    .getByRole("button", { name: /Publicar compromiso del sorteo/i })
    .first();

  if (await boton.count()) {
    await boton.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await boton.click();
  } else {
    await alternativo.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    if (await alternativo.count()) await alternativo.click();
  }
  await page.waitForTimeout(2000);

  const fila = await esperarHasta(
    async () => {
      const { data } = await admin
        .from("raffles")
        .select("draw_commitment, draw_commitment_at")
        .eq("id", raffleId)
        .maybeSingle();
      return data?.draw_commitment ? data : null;
    },
    { timeout: 20000 },
  );
  if (!fila) {
    const error = await page
      .locator('[role="alert"], .text-destructive, [class*="destructive"]')
      .first()
      .innerText()
      .catch(() => "");
    throw new Error(`no se publicó el compromiso${error ? `: ${error}` : ""}`);
  }
  return fila;
}

/**
 * Reserva números por el flujo real de prepago:
 * grilla → «Reservar y enviar comprobante» → términos → modal «Reserva confirmada».
 */
async function reservarNumerosF(page, corrida, { numeros, captura }) {
  await page.locator("[data-number]").first().waitFor({ state: "visible", timeout: 30000 });

  for (const numero of numeros) {
    const celda = page.locator(`[data-number="${numero}"]`).first();
    await celda.waitFor({ state: "visible", timeout: 20000 });
    await celda.click();
    await page.waitForTimeout(150);
  }

  await page
    .getByRole("button", { name: /Reservar y enviar comprobante/i })
    .first()
    .click();
  await page.waitForTimeout(500);

  const terminos = page
    .getByRole("dialog")
    .filter({ hasText: "Términos y Condiciones del sorteo" });
  if (await terminos.count()) {
    await terminos.getByRole("checkbox").first().check({ force: true });
    await terminos.getByRole("button", { name: /Aceptar y continuar/i }).click();
    await page.waitForTimeout(800);
  }

  const direccion = page
    .getByRole("dialog")
    .filter({ hasText: "¿A dónde te mandamos el premio?" });
  if (await direccion.count()) {
    for (const [id, valor] of Object.entries({
      "gate-phone": "+5491155550198",
      "gate-address": "Av. Siempreviva 742",
      "gate-city": "Buenos Aires",
      "gate-province": "CABA",
      "gate-postal": "1000",
      "gate-country": "Argentina",
    })) {
      await page.locator(`#${id}`).fill(valor).catch(() => {});
    }
    await page.getByRole("button", { name: /Guardar y reservar/i }).click();
    await page.waitForTimeout(1500);
  }

  const confirmacion = page
    .getByRole("dialog")
    .filter({ hasText: "Reserva confirmada" });
  await confirmacion.waitFor({ state: "visible", timeout: 30000 });
  const texto = await confirmacion.innerText();
  if (captura) await capturar(page, corrida, captura);

  const whatsapp = confirmacion
    .getByRole("link", { name: /Enviar comprobante por WhatsApp/i })
    .first();
  const href = (await whatsapp.count()) ? await whatsapp.getAttribute("href") : null;

  await confirmacion.getByRole("button", { name: /Cerrar/i }).first().click().catch(() => {});
  return { texto, whatsappHref: href };
}

async function aprobarNotificacionF(page, vars, notificacionId) {
  const base = vars.NEXT_PUBLIC_URL ?? "http://localhost:3000";
  await page.goto(`${base}/admin/notificaciones`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const tarjeta = page.locator(`#noti-${notificacionId}`);
  await tarjeta.waitFor({ state: "visible", timeout: 30000 });
  const boton = tarjeta.getByRole("button", { name: /^Aprobar$/i }).first();
  if (!(await boton.count())) {
    throw new Error(`la notificación ${notificacionId} no tiene botón Aprobar`);
  }
  await boton.click();
  await page.waitForTimeout(1200);

  const error = page.locator('[role="alert"]').first();
  if (await error.count()) {
    const texto = (await error.innerText().catch(() => "")).trim();
    if (texto) throw new Error(`la aprobación falló: ${texto}`);
  }
}

async function notificacionPendienteF(admin, raffleId, numeros) {
  const esperados = [...numeros].sort((a, b) => a - b).join(",");
  const { data } = await admin
    .from("notifications")
    .select("id, type, status, payload, created_at")
    .eq("raffle_id", raffleId)
    .eq("type", "reservation_pending")
    .in("status", ["pending", "read"])
    .order("created_at", { ascending: false });

  return (
    (data ?? []).find((fila) => {
      const propios = [...((fila.payload?.numbers ?? []) || [])]
        .sort((a, b) => a - b)
        .join(",");
      return propios === esperados;
    }) ?? null
  );
}

async function escenarioF({ vars, admin, corrida, titulo }) {
  const base = vars.NEXT_PUBLIC_URL ?? "http://localhost:3000";
  const browser = await chromium.launch({ headless: true });
  const salida = {
    entorno: {},
    cuentas: {},
    sorteos: {},
    referidos: {},
    compras: {},
    premio: {},
    sorteo: {},
    resultados: {},
    consola: {},
  };
  // `--titulo` fija el nombre exacto del sorteo (pedido de auditoría); sin él
  // se conserva el título con sufijo para no chocar entre corridas.
  const tituloPrincipal = titulo ?? `E2E Full — Principal`;
  const tituloBonus = titulo ? `${titulo} — bonus` : `E2E Full — Bonus`;

  const guardarJson = (nombre, objeto) => {
    writeFileSync(
      resolve(corrida.dir, nombre),
      JSON.stringify(objeto, null, 2) + "\n",
      "utf8",
    );
    return nombre;
  };

  const sufijo = `${Date.now()}`;
  const emails = {
    org: `e2e.full.organizador+${sufijo}@gadu.test`,
    a: `e2e.full.jugadora+${sufijo}@gadu.test`,
    b: `e2e.full.jugadorb+${sufijo}@gadu.test`,
  };

  let orgSesion = null;
  let sesionA = null;
  let sesionB = null;
  let anonimo = null;

  try {
    // ---------------------------------------------------------------- F0
    {
      const paso = corrida.abrir({
        paso: "F0-entorno-staging",
        rol: "sistema",
        esperado:
          "la app y los bundles del navegador hablan con dolxvoxyespguvixhkku y nunca con producción",
      });

      try {
        const respuesta = await fetch(base, { redirect: "follow" });
        const html = await respuesta.text();
        const srcs = [
          ...new Set(
            [...html.matchAll(/(?:src|href)="([^"]+\.js[^"]*)"/g)].map((m) => m[1]),
          ),
        ];

        let bundlesPrueba = 0;
        let bundlesProduccion = 0;
        for (const src of srcs) {
          try {
            const url = new URL(src, base).href;
            const contenido = await (await fetch(url)).text();
            if (contenido.includes(REF_STAGING)) bundlesPrueba += 1;
            if (contenido.includes(REF_PRODUCCION)) bundlesProduccion += 1;
          } catch {
            // Un chunk que no se puede leer no invalida el resto.
          }
        }

        const { data: migracion, error: errorMigracion } = await admin
          .from("_applied_migrations")
          .select("version")
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();

        const urlSupabase = String(vars.NEXT_PUBLIC_SUPABASE_URL ?? "");
        const usaStaging = urlSupabase.includes(REF_STAGING);
        const usaProduccion = urlSupabase.includes(REF_PRODUCCION);

        salida.entorno = {
          base,
          status: respuesta.status,
          urlSupabase,
          usaStaging,
          usaProduccion,
          bundles: srcs.length,
          bundlesPrueba,
          bundlesProduccion,
          migracion: migracion?.version ?? null,
          errorMigracion: errorMigracion?.message ?? null,
        };
        const archivo = guardarJson("F0-entorno.json", salida.entorno);

        const ok =
          respuesta.ok &&
          usaStaging &&
          !usaProduccion &&
          bundlesProduccion === 0 &&
          bundlesPrueba > 0 &&
          !html.includes(REF_PRODUCCION);

        paso.cerrar({
          observado: `HTTP ${respuesta.status}; Supabase ${urlSupabase.includes(REF_STAGING) ? "staging" : "INESPERADO"}; chunks=${srcs.length} (staging=${bundlesPrueba}, producción=${bundlesProduccion}); migración ${migracion?.version ?? "?"}`,
          resultado: ok ? "ok" : "falla",
          evidencia: [archivo],
          nota: ok
            ? "el HTML SSR no imprime la ref de Supabase; se comprobó en los chunks del cliente"
            : "BLOQUEO: el objetivo no es staging o algún bundle contiene la ref de producción",
        });

        if (!ok) throw new Error("el entorno no pasó el candado de staging");
      } catch (error) {
        paso.cerrar({
          observado: `error: ${error.message}`,
          resultado: "falla",
          evidencia: [guardarJson("F0-entorno.json", { error: error.message })],
        });
        throw error;
      }
    }

    // ---------------------------------------------------------------- F1
    {
      const paso = corrida.abrir({
        paso: "F1-preparacion-cuentas",
        rol: "organizador+jA+jB",
        esperado:
          "tres cuentas sintéticas listas: organizador admin/premium con KYC aprobado y dos jugadores con dirección completa",
      });

      try {
        const org = await crearCuentaF(admin, vars, {
          email: emails.org,
          nombre: "E2E Full Organizador",
          rol: "organizador",
          telefono: "+5491155550201",
          kyc: true,
        });
        const a = await crearCuentaF(admin, vars, {
          email: emails.a,
          nombre: "E2E Full Jugadora A",
          rol: "jugadorA",
          telefono: "+5491155550198",
        });
        const b = await crearCuentaF(admin, vars, {
          email: emails.b,
          nombre: "E2E Full Jugador B",
          rol: "jugadorB",
          telefono: "+5491155550197",
        });

        salida.cuentas = { org, a, b };
        const archivo = guardarJson("F1-cuentas.json", salida.cuentas);

        paso.cerrar({
          observado: `organizador ${org.id.slice(0, 8)} (creado=${org.creado}), A ${a.id.slice(0, 8)}, B ${b.id.slice(0, 8)}`,
          resultado: "ok",
          evidencia: [archivo],
          nota: "laboratorio: cuentas por Admin API y profiles por service_role; no existe alta por UI",
        });
      } catch (error) {
        paso.cerrar({
          observado: `error: ${error.message}`,
          resultado: "falla",
          evidencia: [guardarJson("F1-cuentas.json", { error: error.message })],
        });
        throw error;
      }
    }

    // ---------------------------------------------------------------- F2
    {
      const paso = corrida.abrir({
        paso: "F2-sorteo-bonus",
        rol: "organizador",
        esperado: "sorteo bonus activo, no listado, listo para recibir el número 🎁",
      });

      try {
        orgSesion = await nuevaSesionF(browser, vars, {
          email: salida.cuentas.org.email,
          password: vars.SIM_PASSWORD,
          rol: "organizador",
          aal2: true,
        });

        const bonusId = await crearSorteoF(
          orgSesion.page,
          vars,
          {
            titulo: titulo ? tituloBonus : `${tituloBonus} ${sufijo}`,
            maxNumbers: 50,
            winnersCount: 1,
          },
          admin,
        );
        const cap = await capturar(orgSesion.page, corrida, "F02-bonus-creado");

        const { data: bonus, error } = await admin
          .from("raffles")
          .select("id, slug, title, status, winners_count, is_listed, draw_date")
          .eq("id", bonusId)
          .single();
        if (error) throw new Error(`no pude leer el bonus: ${error.message}`);

        salida.sorteos.bonusId = bonusId;
        salida.sorteos.bonusSlug = bonus.slug;
        salida.sorteos.bonus = bonus;
        const archivo = guardarJson("F2-bonus.json", bonus);

        paso.cerrar({
          observado: `${bonus.title} (${bonus.slug}) estado=${bonus.status} listado=${bonus.is_listed} premios=${bonus.winners_count}`,
          resultado: bonus.status === "active" && bonus.is_listed === false ? "ok" : "falla",
          evidencia: [cap, archivo],
        });
      } catch (error) {
        paso.cerrar({
          observado: `error: ${error.message}`,
          resultado: "falla",
          evidencia: [guardarJson("F2-bonus.json", { error: error.message })],
        });
        throw error;
      }
    }

    // ---------------------------------------------------------------- F3
    {
      const paso = corrida.abrir({
        paso: "F3-sorteo-principal-3-premios",
        rol: "organizador",
        esperado:
          "sorteo principal activo con 3 premios, «Invitá y Ganá» mínimo 2 / tope 1 y bonus asignado",
      });

      try {
        const mainId = await crearSorteoF(
          orgSesion.page,
          vars,
          {
            titulo: titulo ? tituloPrincipal : `${tituloPrincipal} ${sufijo}`,
            maxNumbers: 100,
            winnersCount: 3,
            referral: true,
            referralMin: 2,
            referralMax: 1,
            bonusId: salida.sorteos.bonusId,
          },
          admin,
        );
        salida.sorteos.mainId = mainId;

        const premios = [
          { position: 1, title: "1º premio — Kit Gadu" },
          { position: 2, title: "2º premio — Auriculares" },
          { position: 3, title: "3º premio — Voucher" },
        ];
        await agregarPremiosF(orgSesion.page, vars, mainId, premios);
        const cap = await capturar(orgSesion.page, corrida, "F03-premios");

        const [{ data: main, error: errorMain }, { data: prizes, error: errorPrizes }] =
          await Promise.all([
            admin
              .from("raffles")
              .select(
                "id, slug, title, status, winners_count, referral_enabled, referral_min_numbers, referral_max_per_user, bonus_raffle_id, is_listed",
              )
              .eq("id", mainId)
              .single(),
            admin
              .from("prizes")
              .select("position, title")
              .eq("raffle_id", mainId)
              .order("position", { ascending: true }),
          ]);
        if (errorMain) throw new Error(`no pude leer el principal: ${errorMain.message}`);
        if (errorPrizes) throw new Error(`no pude leer los premios: ${errorPrizes.message}`);

        salida.sorteos.main = main;
        salida.sorteos.mainSlug = main.slug;
        salida.sorteos.prizes = prizes;
        const archivo = guardarJson("F3-principal.json", { main, prizes });

        const okBase =
          main.status === "active" &&
          main.winners_count === 3 &&
          main.is_listed === false &&
          (prizes ?? []).length === 3;
        const okReferral =
          main.referral_enabled === true &&
          main.referral_min_numbers === 2 &&
          main.referral_max_per_user === 1 &&
          main.bonus_raffle_id === salida.sorteos.bonusId;

        paso.cerrar({
          observado: `${main.title} (${main.slug}); premios=${(prizes ?? []).map((p) => p.title).join(" | ")}; referidos=${main.referral_enabled}/${main.referral_min_numbers}/${main.referral_max_per_user}; bonus=${String(main.bonus_raffle_id).slice(0, 8)}`,
          resultado: okBase && okReferral ? "ok" : "falla",
          evidencia: [cap, archivo],
          nota: okReferral
            ? null
            : "hallazgo: el wizard de alta muestra «Invitá y Ganá» pero su INSERT no persiste referral_*/bonus_raffle_id. La configuración se hace desde /editar para poder continuar.",
        });
        if (!okBase) throw new Error("el sorteo principal no quedó con la estructura pedida");

        {
          const pasoEdicion = corrida.abrir({
            paso: "F3b-referidos-por-edicion",
            rol: "organizador",
            esperado: okReferral
              ? "la edición mantiene la configuración de referidos que el alta ya persistió"
              : "la pantalla de edición guarda mínimo 2, tope 1 y el sorteo bonus que el alta no persistió",
          });
          try {
            const actualizado = await configurarReferidosF(
              orgSesion.page,
              vars,
              admin,
              mainId,
              { min: 2, max: 1, bonusId: salida.sorteos.bonusId },
            );
            salida.sorteos.main = actualizado;
            const capEdicion = await capturar(orgSesion.page, corrida, "F03b-referidos-editados");
            const archivoEdicion = guardarJson("F3b-referidos.json", actualizado);
            pasoEdicion.cerrar({
              observado: `referidos=${actualizado.referral_enabled}/${actualizado.referral_min_numbers}/${actualizado.referral_max_per_user}; bonus=${String(actualizado.bonus_raffle_id).slice(0, 8)}`,
              resultado: "ok",
              evidencia: [capEdicion, archivoEdicion],
              nota: okReferral
                ? "idempotente: el alta ya la había guardado"
                : "workaround temporal: el alta no la guardó y se corrigió desde /editar",
            });
          } catch (error) {
            pasoEdicion.cerrar({
              observado: `error: ${error.message}`,
              resultado: "falla",
              evidencia: [guardarJson("F3b-referidos.json", { error: error.message })],
            });
            throw error;
          }
        }
      } catch (error) {
        paso.cerrar({
          observado: `error: ${error.message}`,
          resultado: "falla",
          evidencia: [guardarJson("F3-principal.json", { error: error.message })],
        });
        throw error;
      }
    }

    // ---------------------------------------------------------------- F4
    {
      const paso = corrida.abrir({
        paso: "F4-compromiso-publicado",
        rol: "organizador",
        esperado: "el compromiso de la semilla queda publicado antes de vender",
      });

      try {
        const fila = await publicarCompromisoF(
          orgSesion.page,
          vars,
          admin,
          salida.sorteos.mainId,
          corrida,
        );
        const cap = await capturar(orgSesion.page, corrida, "F04-compromiso");
        if (!fila?.draw_commitment) throw new Error("no se publicó el compromiso");

        salida.sorteos.commitment = fila.draw_commitment;
        const archivo = guardarJson("F4-compromiso.json", fila);

        paso.cerrar({
          observado: `compromiso ${fila.draw_commitment.slice(0, 16)}… (${fila.draw_commitment_at})`,
          resultado: "ok",
          evidencia: [cap, archivo],
        });
      } catch (error) {
        paso.cerrar({
          observado: `error: ${error.message}`,
          resultado: "falla",
          evidencia: [guardarJson("F4-compromiso.json", { error: error.message })],
        });
        throw error;
      }
    }

    // ---------------------------------------------------------------- F4b
    {
      const paso = corrida.abrir({
        paso: "F4b-enlace-corto-mis-numeros",
        rol: "organizador",
        esperado:
          "«Mis Números» muestra el enlace de referido corto /r/CODIGO, no el formato largo /sorteos/[slug]?ref=UUID",
      });

      try {
        await irF(orgSesion.page, vars, "/mis-numeros");
        await dormir(2500);
        await orgSesion.page
          .getByText(/Invitá y ganá/i)
          .first()
          .waitFor({ state: "visible", timeout: 20000 });

        const codigoEl = orgSesion.page
          .locator("code")
          .filter({ hasText: /\/r\// })
          .first();
        const hayCodigo = (await codigoEl.count()) > 0;
        const enlace = hayCodigo ? (await codigoEl.innerText()).trim() : "";
        const m = enlace.match(/\/r\/([A-Z0-9]{6})(?:\b|$)/i);
        const codigo = m?.[1] ?? null;

        const { data: perfil } = await admin
          .from("profiles")
          .select("referral_code")
          .eq("id", salida.cuentas.org.id)
          .single();

        const cap = await capturar(orgSesion.page, corrida, "F04b-mis-numeros-enlace");
        salida.referidos = {
          enlaceMostrado: enlace,
          codigo,
          perfilCodigo: perfil?.referral_code ?? null,
          formatoLargo: /\/sorteos\//.test(enlace) || /ref=/.test(enlace),
          esCorto: Boolean(codigo) && enlace.startsWith(`${base}/r/`),
        };
        const archivo = guardarJson("F4b-enlace.json", salida.referidos);
        const ok =
          Boolean(codigo) &&
          enlace.startsWith(`${base}/r/`) &&
          perfil?.referral_code === codigo;

        paso.cerrar({
          observado: hayCodigo
            ? `enlace visible: ${enlace}; profiles.referral_code=${perfil?.referral_code ?? "—"}`
            : "la tarjeta «Invitá y ganá» no muestra ningún <code>: el enlace no se renderizó",
          resultado: ok ? "ok" : "falla",
          evidencia: [cap, archivo],
          nota: ok
            ? null
            : "la tarjeta no está mostrando `${base}/r/<code>`: revisar referralCode null o la regla del sorteo; NO se vuelve al formato largo",
        });
        if (!codigo) throw new Error("no pude extraer el código corto del enlace visible");
      } catch (error) {
        paso.cerrar({
          observado: `error: ${error.message}`,
          resultado: "falla",
          evidencia: [guardarJson("F4b-enlace.json", { error: error.message })],
        });
      }
    }

    // ---------------------------------------------------------------- F5
    {
      const codigo = salida.referidos?.codigo ?? null;
      const enlaceCorto = codigo ? `${base}/r/${codigo}` : null;
      const pasoRef = corrida.abrir({
        paso: "F5a-enlace-corto-incognito",
        rol: "incognito→jugadorA",
        esperado:
          "un navegador nuevo abre /r/CODIGO, redirige a /sorteos/<slug>?ref=CODIGO y, al iniciar sesión, ReferralCapture crea el vínculo",
      });

      try {
        if (!codigo || !enlaceCorto) {
          throw new Error("F4b no dejó un código corto: no hay enlace que probar");
        }

        // 1) Contexto limpio, SIN cookies de sesión: el "usuario nuevo" del pedido.
        sesionA = await nuevoContextoAnonimo(browser, "incognito");
        const { status } = await irF(sesionA.page, vars, `/r/${codigo}`);
        await dormir(1500);

        const urlFinal = sesionA.page.url();
        const esperadoUrl = `${base}/sorteos/${salida.sorteos.mainSlug}?ref=${codigo}`;
        const redirigeOk = urlFinal === esperadoUrl;
        const capIncognito = await capturar(
          sesionA.page,
          corrida,
          "F05a-enlace-corto-incognito",
        );

        // 2) El usuario nuevo inicia sesión en el MISMO contexto: el ?ref= queda
        //    en localStorage y ReferralCapture lo registra al autenticarse.
        const sesionCruda = await obtenerSesion(vars, {
          email: salida.cuentas.a.email,
          password: vars.SIM_PASSWORD,
        });
        await inyectarSesion(sesionA.contexto, vars, sesionCruda);
        await sesionA.page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
        await dormir(4000);
        const capTrasLogin = await capturar(sesionA.page, corrida, "F05a-tras-login");

        const fila = await esperarHasta(
          async () => {
            const { data } = await admin
              .from("referrals")
              .select("id, referrer_id, referred_id, rewarded, rewarded_number")
              .eq("referrer_id", salida.cuentas.org.id)
              .eq("referred_id", salida.cuentas.a.id)
              .maybeSingle();
            return data ?? null;
          },
          { timeout: 15000 },
        );

        let creadaPorUI = Boolean(fila);
        if (!fila) {
          // Si la captura del navegador falla, no se disimula: se crea el
          // vínculo por service_role para poder seguir y el paso queda falla.
          const { error } = await admin.from("referrals").insert({
            referrer_id: salida.cuentas.org.id,
            referred_id: salida.cuentas.a.id,
          });
          if (error) throw new Error(`no pude crear el referido de rescate: ${error.message}`);
          creadaPorUI = false;
        }

        salida.compras.enlaceReferido = enlaceCorto;
        salida.compras.referidoCreadoPorUI = creadaPorUI;
        const archivo = guardarJson("F5a-referido.json", {
          enlacePedido: enlaceCorto,
          urlFinal,
          esperadoUrl,
          redirigeOk,
          creadaPorUI,
          fila,
        });

        pasoRef.cerrar({
          observado: `abrí ${enlaceCorto} (HTTP ${status}) → ${urlFinal}; redirect correcto=${redirigeOk}; vínculo creado por UI=${creadaPorUI}; errores de consola=${sesionA.errores.length}`,
          resultado: redirigeOk && creadaPorUI ? "ok" : "falla",
          evidencia: [capIncognito, capTrasLogin, archivo],
          nota: !redirigeOk
            ? `el enlace corto no llevó a ${esperadoUrl}: revisar app/r/[code]/page.tsx y resolver_referral_code`
            : creadaPorUI
              ? null
              : "hallazgo: ReferralCapture no creó el vínculo al iniciar sesión; el resto del escenario sigue con el vínculo inyectado",
        });
      } catch (error) {
        pasoRef.cerrar({
          observado: `error: ${error.message}`,
          resultado: "falla",
          evidencia: [guardarJson("F5a-referido.json", { error: error.message })],
        });
      }

      const pasoCompra = corrida.abrir({
        paso: "F5b-compra-jugadorA",
        rol: "jugadorA",
        esperado: "2 números reservados con prepago (hold 48 h) y modal de comprobante",
      });
      try {
        if (!sesionA) throw new Error("no hay sesión de Jugador A");
        const reserva = await reservarNumerosF(sesionA.page, corrida, {
          numeros: [1, 2],
          captura: "F05-compra-A",
        });
        const { data: filas } = await admin
          .from("raffle_numbers")
          .select("number, status, reserved_by, reserved_until")
          .eq("raffle_id", salida.sorteos.mainId)
          .in("number", [1, 2]);
        const reservados = (filas ?? []).filter(
          (f) => f.status === "reserved" && f.reserved_by === salida.cuentas.a.id,
        );

        salida.compras.a = { numeros: [1, 2], reserva, filas };
        const archivo = guardarJson("F5b-compra-A.json", salida.compras.a);

        pasoCompra.cerrar({
          observado: `${reservados.length}/2 con status reserved; WhatsApp=${reserva.whatsappHref ? "sí" : "no"}; modal: ${reserva.texto.replace(/\s+/g, " ").slice(0, 120)}`,
          resultado: reservados.length === 2 ? "ok" : "falla",
          evidencia: ["capturas/F05-compra-A.png", archivo],
        });
        if (reservados.length !== 2) throw new Error("Jugador A no quedó con 2 números reservados");
      } catch (error) {
        pasoCompra.cerrar({
          observado: `error: ${error.message}`,
          resultado: "falla",
          evidencia: [guardarJson("F5b-compra-A.json", { error: error.message })],
        });
      }
    }

    // ---------------------------------------------------------------- F6
    {
      const paso = corrida.abrir({
        paso: "F6-compra-jugadorB",
        rol: "jugadorB",
        esperado: "3 números reservados con prepago, sin usar enlace de referido",
      });

      try {
        sesionB = await nuevaSesionF(browser, vars, {
          email: salida.cuentas.b.email,
          password: vars.SIM_PASSWORD,
          rol: "jugadorB",
        });
        await irF(sesionB.page, vars, `/sorteos/${salida.sorteos.mainSlug}`);
        await dormir(2000);
        const reserva = await reservarNumerosF(sesionB.page, corrida, {
          numeros: [4, 5, 6],
          captura: "F06-compra-B",
        });
        const { data: filas } = await admin
          .from("raffle_numbers")
          .select("number, status, reserved_by")
          .eq("raffle_id", salida.sorteos.mainId)
          .in("number", [4, 5, 6]);
        const reservados = (filas ?? []).filter(
          (f) => f.status === "reserved" && f.reserved_by === salida.cuentas.b.id,
        );

        salida.compras.b = { numeros: [4, 5, 6], reserva, filas };
        const archivo = guardarJson("F6-compra-B.json", salida.compras.b);

        paso.cerrar({
          observado: `${reservados.length}/3 con status reserved; WhatsApp=${reserva.whatsappHref ? "sí" : "no"}`,
          resultado: reservados.length === 3 ? "ok" : "falla",
          evidencia: ["capturas/F06-compra-B.png", archivo],
        });
        if (reservados.length !== 3) throw new Error("Jugador B no quedó con 3 números reservados");
      } catch (error) {
        paso.cerrar({
          observado: `error: ${error.message}`,
          resultado: "falla",
          evidencia: [guardarJson("F6-compra-B.json", { error: error.message })],
        });
      }

      // B ya no se necesita: cerrar su contexto libera memoria para el sorteo.
      if (sesionB) await sesionB.contexto.close().catch(() => {});
    }

    // ---------------------------------------------------------------- F7
    {
      const pasoA = corrida.abrir({
        paso: "F7a-aprobacion-jugadorA",
        rol: "organizador",
        esperado:
          "la reserva de A pasa a sold y se dispara reward_referral con el número 🎁 del sorteo bonus",
      });

      try {
        const notiA = await notificacionPendienteF(admin, salida.sorteos.mainId, [1, 2]);
        if (!notiA) throw new Error("no encontré la notificación de reserva de A");

        await irF(orgSesion.page, vars, "/admin/notificaciones");
        await dormir(1000);
        await capturar(orgSesion.page, corrida, "F07-notificaciones-antes");

        await aprobarNotificacionF(orgSesion.page, vars, notiA.id);
        const cap = await capturar(orgSesion.page, corrida, "F07-tras-aprobar-A");

        const resultado = await esperarHasta(
          async () => {
            const [{ data: numeros }, { data: filaRef }] = await Promise.all([
              admin
                .from("raffle_numbers")
                .select("number, status, sold_to, origin")
                .eq("raffle_id", salida.sorteos.mainId)
                .in("number", [1, 2]),
              admin
                .from("referrals")
                .select("*")
                .eq("referrer_id", salida.cuentas.org.id)
                .eq("referred_id", salida.cuentas.a.id)
                .maybeSingle(),
            ]);
            const vendidos = (numeros ?? []).filter(
              (f) => f.status === "sold" && f.sold_to === salida.cuentas.a.id,
            );
            return vendidos.length === 2 && filaRef?.rewarded ? { numeros, filaRef } : null;
          },
          { timeout: 20000 },
        );
        if (!resultado) throw new Error("la aprobación no dejó números vendidos y referido premiado");

        const { data: bonusRows } = await admin
          .from("raffle_numbers")
          .select("number, status, sold_to, origin")
          .eq("raffle_id", salida.sorteos.bonusId)
          .eq("sold_to", salida.cuentas.org.id)
          .eq("status", "sold");
        const numeroPremio = (bonusRows ?? []).find((f) => f.origin === "premio") ?? null;

        const { data: notis } = await admin
          .from("notifications")
          .select("id, user_id, type, title, message, created_at")
          .in("user_id", [salida.cuentas.a.id, salida.cuentas.org.id])
          .order("created_at", { ascending: false })
          .limit(30);
        const notiAprobada = (notis ?? []).find(
          (n) => n.user_id === salida.cuentas.a.id && n.type === "buyer_reservation_approved",
        );
        const notiPremio = (notis ?? []).find(
          (n) => n.user_id === salida.cuentas.org.id && n.type === "buyer_referral_reward",
        );

        const { data: bonusA } = await admin
          .from("raffle_numbers")
          .select("number, status, sold_to, origin")
          .eq("raffle_id", salida.sorteos.bonusId)
          .eq("sold_to", salida.cuentas.a.id);
        const aRecibioPremio = (bonusA ?? []).some((f) => f.origin === "premio");

        salida.premio = {
          notiA: notiA.id,
          numeros: resultado.numeros,
          referral: resultado.filaRef,
          numeroPremio,
          notificaciones: { aprobada: notiAprobada ?? null, premio: notiPremio ?? null },
          aRecibioPremio,
        };
        const archivo = guardarJson("F7a-aprobacion-A.json", salida.premio);

        const ok =
          (resultado.numeros ?? []).every((f) => f.status === "sold") &&
          resultado.filaRef?.rewarded === true &&
          resultado.filaRef?.rewarded_raffle_id === salida.sorteos.bonusId &&
          Boolean(numeroPremio) &&
          Boolean(notiAprobada) &&
          Boolean(notiPremio);

        pasoA.cerrar({
          observado: `A vendida=${(resultado.numeros ?? []).map((f) => `${f.number}:${f.status}`).join(",")}; referral rewarded=${resultado.filaRef?.rewarded} en bonus ${String(resultado.filaRef?.rewarded_raffle_id).slice(0, 8)}; número 🎁=${numeroPremio?.number ?? "—"} (sold_to ${String(numeroPremio?.sold_to ?? "").slice(0, 8)}); notis A=${Boolean(notiAprobada)} / org=${Boolean(notiPremio)}`,
          resultado: ok ? "ok" : "falla",
          evidencia: [cap, archivo],
          nota: "regla 0102/0105: el número 🎁 se acredita al referente (organizador); el invitado no lo recibe",
        });
        if (!ok) throw new Error("la aprobación de A no cumplió el circuito de premio");
      } catch (error) {
        pasoA.cerrar({
          observado: `error: ${error.message}`,
          resultado: "falla",
          evidencia: [guardarJson("F7a-aprobacion-A.json", { error: error.message })],
        });
      }

      // F-02 no es un defecto: el premio es del referente. Lo que se verifica
      // es que el número 🎁 quede a nombre del organizador, no del invitado.
      {
        const paso = corrida.abrir({
          paso: "F7b-premio-al-referente",
          rol: "organizador",
          esperado: "el número 🎁 queda en el sorteo bonus a nombre del organizador (referente)",
        });
        const referenteOk =
          salida.premio.numeroPremio?.sold_to === salida.cuentas.org.id &&
          salida.premio.referral?.rewarded === true &&
          salida.premio.aRecibioPremio === false;
        const archivo = guardarJson("F7b-receptor.json", {
          referenteOk,
          aRecibioPremio: salida.premio.aRecibioPremio ?? null,
          numeroPremio: salida.premio.numeroPremio ?? null,
          regla: "0102/0105: el premio va al referente",
        });
        paso.cerrar({
          observado: referenteOk
            ? `el número ${salida.premio.numeroPremio?.number ?? "—"} quedó para el organizador ${String(salida.cuentas.org.id).slice(0, 8)}; A no lo recibió (correcto)`
            : `número 🎁=${salida.premio.numeroPremio?.number ?? "—"}, sold_to=${String(salida.premio.numeroPremio?.sold_to ?? "").slice(0, 8)}, referente=${String(salida.cuentas.org.id).slice(0, 8)}, A lo recibió=${salida.premio.aRecibioPremio}`,
          resultado: referenteOk ? "ok" : "falla",
          evidencia: [archivo],
          nota: "regla 0102/0105: premia al referente, no al invitado",
        });
      }

      // Evidencia visual: A no ve bono; el organizador sí.
      {
        const paso = corrida.abrir({
          paso: "F7c-premio-en-pantalla",
          rol: "jugadorA+organizador",
          esperado: "ver en «Mis números» que el organizador (referente) tiene el bono y A no",
        });
        try {
          if (sesionA) {
            await irF(sesionA.page, vars, "/mis-numeros");
            await dormir(2500);
          }
          const capA = sesionA
            ? await capturar(sesionA.page, corrida, "F07-mis-numeros-A")
            : null;

          await irF(orgSesion.page, vars, "/mis-numeros");
          await dormir(2500);
          const capOrg = await capturar(orgSesion.page, corrida, "F07-mis-numeros-organizador");
          const textoOrg = await vistazoF(orgSesion.page, 1600);

          paso.cerrar({
            observado: `A: ${capA ? "captura tomada" : "sin sesión"}; organizador muestra bono=${/Bono de Referido/i.test(textoOrg)}; número=${salida.premio.numeroPremio?.number ?? "—"}`,
            resultado: /Bono de Referido/i.test(textoOrg) ? "ok" : "falla",
            evidencia: [capA, capOrg].filter(Boolean),
          });
        } catch (error) {
          paso.cerrar({
            observado: `error: ${error.message}`,
            resultado: "falla",
            evidencia: [guardarJson("F7c-premio-pantalla.json", { error: error.message })],
          });
        }

        // A ya no se necesita: su captura quedó tomada.
        if (sesionA) await sesionA.contexto.close().catch(() => {});
      }

      // Aprobación de B (sin referido): completa los 5 números vendidos.
      {
        const paso = corrida.abrir({
          paso: "F7d-aprobacion-jugadorB",
          rol: "organizador",
          esperado: "la reserva de B pasa a sold y el total vendido queda en 5",
        });
        try {
          const notiB = await notificacionPendienteF(admin, salida.sorteos.mainId, [4, 5, 6]);
          if (!notiB) throw new Error("no encontré la notificación de reserva de B");
          await aprobarNotificacionF(orgSesion.page, vars, notiB.id);
          const cap = await capturar(orgSesion.page, corrida, "F07-tras-aprobar-B");

          const filas = await esperarHasta(
            async () => {
              const { data } = await admin
                .from("raffle_numbers")
                .select("number, status, sold_to")
                .eq("raffle_id", salida.sorteos.mainId)
                .eq("status", "sold");
              return (data ?? []).length >= 5 ? data : null;
            },
            { timeout: 15000 },
          );
          if (!filas) throw new Error("no quedaron 5 números vendidos");

          salida.compras.vendidos = filas;
          const archivo = guardarJson("F7d-aprobacion-B.json", filas);
          paso.cerrar({
            observado: `${filas.length} vendidos: ${filas.map((f) => f.number).join(",")}`,
            resultado: filas.length >= 5 ? "ok" : "falla",
            evidencia: [cap, archivo],
          });
        } catch (error) {
          paso.cerrar({
            observado: `error: ${error.message}`,
            resultado: "falla",
            evidencia: [guardarJson("F7d-aprobacion-B.json", { error: error.message })],
          });
        }
      }
    }

    // ---------------------------------------------------------------- F8
    {
      const pasoDraw = corrida.abrir({
        paso: "F8a-sorteo-en-vivo",
        rol: "organizador",
        esperado: "el botón «Iniciar sorteo» ejecuta el sorteo y la animación lo revela",
      });

      try {
        const { data: antes, error: errorAntes } = await admin
          .from("raffles")
          .select("auto_draw, status, draw_commitment, draw_date")
          .eq("id", salida.sorteos.mainId)
          .single();
        if (errorAntes) throw new Error(errorAntes.message);
        if (antes.status !== "active") throw new Error(`el sorteo está ${antes.status}, no active`);
        if (!antes.draw_commitment) throw new Error("falta el compromiso");
        if (antes.auto_draw) throw new Error("auto_draw está encendido: la intervención no sería limpia");

        // INTERVENCIÓN DE LABORATORIO: el motor exige draw_date <= now. Se
        // publicó el compromiso con fecha futura; ahora se adelanta la fecha.
        const { error: errorFecha } = await admin
          .from("raffles")
          .update({ draw_date: new Date(Date.now() - 60_000).toISOString() })
          .eq("id", salida.sorteos.mainId);
        if (errorFecha) throw new Error(`no pude adelantar draw_date: ${errorFecha.message}`);

        await irF(orgSesion.page, vars, `/sorteos/${salida.sorteos.mainSlug}/en-vivo`);
        await orgSesion.page
          .waitForLoadState("networkidle", { timeout: 20000 })
          .catch(() => {});
        await dormir(2500);
        await capturar(orgSesion.page, corrida, "F08-live-antes");

        const boton = orgSesion.page.getByRole("button", { name: /Iniciar sorteo/i }).first();
        const hayBoton = (await boton.count()) > 0 && (await boton.isVisible().catch(() => false));
        if (!hayBoton) {
          throw new Error(
            `no apareció «Iniciar sorteo». Pantalla: ${(await vistazoF(orgSesion.page, 700)).replace(/\n/g, " · ")}`,
          );
        }

        await boton.click();
        await dormir(1800);
        await capturar(orgSesion.page, corrida, "F08-live-girando");

        await orgSesion.page
          .getByText(/Podio final|Resultado final/i)
          .first()
          .waitFor({ state: "visible", timeout: 60000 })
          .catch(() => {});
        await dormir(1200);
        const capFinal = await capturar(orgSesion.page, corrida, "F08-live-final");

        const { data: sorteo, error: errorSorteo } = await admin
          .from("raffles")
          .select(
            "id, status, winner_number, winners_count, draw_seed, draw_commitment, numbers_hash, result_hash, results_hash, drawn_at",
          )
          .eq("id", salida.sorteos.mainId)
          .single();
        if (errorSorteo) throw new Error(errorSorteo.message);

        const { data: winners, error: errorWinners } = await admin
          .from("raffle_winners")
          .select("position, number, user_id, user_name, prize_title, winner_hash")
          .eq("raffle_id", salida.sorteos.mainId)
          .order("position", { ascending: true });
        if (errorWinners) throw new Error(errorWinners.message);

        salida.sorteo = { sorteo, winners };
        const archivo = guardarJson("F8-sorteo.json", salida.sorteo);

        pasoDraw.cerrar({
          observado: `status=${sorteo.status}; winner_number=${sorteo.winner_number}; raffle_winners=${(winners ?? []).length}; semilla revelada=${Boolean(sorteo.draw_seed)}`,
          resultado: sorteo.status === "drawn" ? "ok" : "falla",
          evidencia: [
            "capturas/F08-live-antes.png",
            "capturas/F08-live-girando.png",
            capFinal,
            archivo,
          ],
          nota: "laboratorio: draw_date se movió al pasado después del compromiso (auto_draw=false)",
        });
      } catch (error) {
        pasoDraw.cerrar({
          observado: `error: ${error.message}`,
          resultado: "falla",
          evidencia: [guardarJson("F8-sorteo.json", { error: error.message })],
        });
      }

      {
        const paso = corrida.abrir({
          paso: "F8b-podio-multipremio",
          rol: "sistema",
          esperado: "3 premios generan 3 ganadores distintos en raffle_winners",
        });
        const archivo = guardarJson("F8b-podio.json", {
          winners: salida.sorteo.winners ?? [],
          winnersCount: salida.sorteo.sorteo?.winners_count ?? null,
        });
        const winners = salida.sorteo.winners ?? [];
        paso.cerrar({
          observado: `${winners.length} ganadores: ${winners.map((w) => `#${w.position} Nº${w.number}`).join(" | ") || "ninguno"}`,
          resultado: winners.length === 3 ? "ok" : "falla",
          evidencia: [archivo],
          nota:
            winners.length === 3
              ? null
              : "el botón de /en-vivo llama execute_transparent_draw, que delega en draw_winner (un ganador) y no en draw_winner_multi",
        });
      }

      if (orgSesion) await orgSesion.contexto.close().catch(() => {});
    }

    // ---------------------------------------------------------------- F9
    {
      const pasoPodio = corrida.abrir({
        paso: "F9a-pagina-resultados",
        rol: "anonimo",
        esperado: "la página pública de resultados muestra el podio con 3 premios",
      });

      try {
        anonimo = await nuevoContextoAnonimo(browser, "anonimo");
        const { status } = await irF(
          anonimo.page,
          vars,
          `/sorteos/${salida.sorteos.mainSlug}/resultados`,
        );
        await dormir(2000);
        const cap = await capturar(anonimo.page, corrida, "F09-resultados");
        const tarjetas = anonimo.page.locator(
          'section[aria-label="Podio de ganadores"] article',
        );
        const cantidad = await tarjetas.count();
        const texto = await vistazoF(anonimo.page, 1400);

        salida.resultados = { status, tarjetas: cantidad, texto };
        const archivo = guardarJson("F9-resultados.json", salida.resultados);

        pasoPodio.cerrar({
          observado: `HTTP ${status}; podio=${cantidad} tarjeta(s); texto: ${texto.replace(/\s+/g, " ").slice(0, 220)}`,
          resultado: cantidad === 3 ? "ok" : "falla",
          evidencia: [cap, archivo],
          nota:
            cantidad === 3
              ? null
              : "sin raffle_winners multi-premio la página cae al ganador único",
        });
      } catch (error) {
        pasoPodio.cerrar({
          observado: `error: ${error.message}`,
          resultado: "falla",
          evidencia: [guardarJson("F9-resultados.json", { error: error.message })],
        });
      }

      // Hashes: se recalculan por fuera del código del servidor.
      {
        const paso = corrida.abrir({
          paso: "F9b-hashes",
          rol: "verificador",
          esperado:
            "compromiso, listado, ganador(es) y huellas coinciden con lo publicado, calculados con node:crypto",
        });
        try {
          const [{ data: vendidos, error: errorVendidos }, { data: final, error: errorFinal }, { data: winnersRows, error: errorWinners }] =
            await Promise.all([
              admin
                .from("raffle_numbers")
                .select("number")
                .eq("raffle_id", salida.sorteos.mainId)
                .eq("status", "sold")
                .order("number", { ascending: true }),
              admin.from("raffles").select("*").eq("id", salida.sorteos.mainId).single(),
              admin
                .from("raffle_winners")
                .select("position, number, winner_hash")
                .eq("raffle_id", salida.sorteos.mainId)
                .order("position", { ascending: true }),
            ]);
          if (errorVendidos) throw new Error(errorVendidos.message);
          if (errorFinal) throw new Error(errorFinal.message);
          if (errorWinners) throw new Error(errorWinners.message);

          const numbers = (vendidos ?? []).map((f) => f.number);
          const single = verificar({
            raffleId: salida.sorteos.mainId,
            seed: final.draw_seed,
            numbers,
          });
          const singleChecks = {
            commitment: single.commitment === final.draw_commitment,
            numbersHash: single.numbersHash === final.numbers_hash,
            winner: single.winner === final.winner_number,
            resultHash: single.resultHash === final.result_hash,
          };

          const multi = verificarMulti({
            raffleId: salida.sorteos.mainId,
            seed: final.draw_seed,
            numbers,
            prizesCount: 3,
          });
          const multiWinnerChecks = (winnersRows ?? []).map((fila, indice) => ({
            position: fila.position,
            coincide:
              fila.number === multi.winners[indice]?.number &&
              fila.winner_hash === multi.winners[indice]?.hash,
          }));
          const multiChecks = {
            commitment: multi.commitment === final.draw_commitment,
            numbersHash: multi.numbersHash === final.numbers_hash,
            winners:
              (winnersRows ?? []).length === 3 &&
              multiWinnerChecks.length === 3 &&
              multiWinnerChecks.every((c) => c.coincide),
            resultsHash: multi.resultsHash === final.results_hash,
          };

          salida.resultados.hashes = {
            numbers,
            single,
            singleChecks,
            multi,
            multiWinnerChecks,
            multiChecks,
            publicado: {
              commitment: final.draw_commitment,
              numbersHash: final.numbers_hash,
              winner: final.winner_number,
              resultHash: final.result_hash,
              resultsHash: final.results_hash,
              winners: winnersRows,
            },
          };
          corrida.guardarHashes({
            escenario: "F",
            sorteo: salida.sorteos.mainId,
            semilla: final.draw_seed,
            commitment: final.draw_commitment,
            numbersHash: final.numbers_hash,
            winner: final.winner_number,
            resultHash: final.result_hash,
            resultsHash: final.results_hash,
            recalculadoPor: "verify-hash.mjs (node:crypto)",
            singleChecks,
            multiChecks,
            coincideSingle: Object.values(singleChecks).every(Boolean),
            coincideMulti: Object.values(multiChecks).every(Boolean),
          });
          const archivo = guardarJson("F9b-hashes.json", salida.resultados.hashes);

          const singleOk = Object.values(singleChecks).every(Boolean);
          const multiOk = Object.values(multiChecks).every(Boolean);

          paso.cerrar({
            observado: `single=${JSON.stringify(singleChecks)}; multi=${JSON.stringify(multiChecks)}; ganadores=${(winnersRows ?? []).length}`,
            resultado: singleOk && multiOk ? "ok" : "falla",
            evidencia: [archivo, "hashes.json"],
            nota: singleOk
              ? multiOk
                ? null
                : "las huellas del ganador único son consistentes, pero faltan winners/results_hash del modo multipremio"
              : "ni siquiera las huellas del ganador único coinciden",
          });
        } catch (error) {
          paso.cerrar({
            observado: `error: ${error.message}`,
            resultado: "falla",
            evidencia: [guardarJson("F9b-hashes.json", { error: error.message })],
          });
        }
      }

      // Verificador público (si existe el modo multi-premio).
      {
        const paso = corrida.abrir({
          paso: "F9c-verificador-publico",
          rol: "anonimo",
          esperado: "la página /verificar recalcula los 3 premios y muestra que coinciden",
        });
        try {
          if (!anonimo) anonimo = await nuevoContextoAnonimo(browser, "anonimo");
          await irF(anonimo.page, vars, `/sorteos/${salida.sorteos.mainSlug}/verificar`);
          await dormir(1500);
          const boton = anonimo.page
            .getByRole("button", { name: /Verificar los \d+ premio/i })
            .first();
          const hayVerificador = (await boton.count()) > 0;
          if (hayVerificador) {
            await boton.click();
            await dormir(2000);
          }
          const cap = await capturar(anonimo.page, corrida, "F09-verificar");
          const texto = await vistazoF(anonimo.page, 1600);
          const ok = /Todos los premios coinciden/i.test(texto);
          paso.cerrar({
            observado: hayVerificador
              ? `verificador presente; “Todos los premios coinciden”=${ok}`
              : "no hay verificador multipremio: la página sólo muestra el ganador único",
            resultado: ok ? "ok" : "falla",
            evidencia: [cap],
          });
        } catch (error) {
          paso.cerrar({
            observado: `error: ${error.message}`,
            resultado: "falla",
            evidencia: [guardarJson("F9c-verificador.json", { error: error.message })],
          });
        }
      }
    }

    // ---------------------------------------------------------------- F10
    {
      const paso = corrida.abrir({
        paso: "F10-consola",
        rol: "todas-las-pestanas",
        esperado: "sin errores de consola ni pageerror en el recorrido",
      });
      const errores = [orgSesion, sesionA, sesionB, anonimo]
        .filter(Boolean)
        .flatMap((s) => s.errores.map((texto) => ({ rol: s.rol, texto })));
      const relevantes = errores.filter(
        (e) => !F_IGNORAR_CONSOLA.some((patron) => patron.test(e.texto)),
      );
      salida.consola = { total: errores.length, relevantes };
      const archivo = guardarJson("F10-consola.json", salida.consola);

      paso.cerrar({
        observado: `${errores.length} error(es) capturado(s); ${relevantes.length} relevante(s)${relevantes.length ? `: ${relevantes.slice(0, 4).map((e) => `[${e.rol}] ${e.texto}`).join(" | ")}` : ""}`,
        resultado: relevantes.length === 0 ? "ok" : "falla",
        evidencia: [archivo],
      });
    }

    return salida;
  } finally {
    await browser.close().catch(() => {});
  }
}

// ------------------------------------------------------------------ entrada

const escenario = process.argv[2];
const sorteoArg = process.argv.includes("--sorteo")
  ? process.argv[process.argv.indexOf("--sorteo") + 1]
  : null;
const numeroArg = process.argv.includes("--numero")
  ? Number(process.argv[process.argv.indexOf("--numero") + 1])
  : 50;
const tituloArg = process.argv.includes("--titulo")
  ? process.argv[process.argv.indexOf("--titulo") + 1]
  : null;
async function main() {
  if (!["A", "B", "C", "D", "F"].includes(escenario)) {
    throw new Error(
      "Uso: node runner.mjs A|B|C|D|F [--sorteo <uuid>] [--numero <n>] [--titulo <texto>]",
    );
  }
  const { vars } = cargarEnvTest();
  const sorteo = sorteoArg ?? vars.SIM_RAFFLE_ID;
  if (escenario !== "F" && !sorteo) {
    throw new Error("Falta el id del sorteo: --sorteo <uuid> o SIM_RAFFLE_ID en .env.test.local");
  }
  if (!vars.SIM_PASSWORD) throw new Error("Falta SIM_PASSWORD en .env.test.local");

  const admin = crearAdmin(vars);
  // Con `--titulo` la evidencia va a una carpeta propia: no pisa la corrida F
  // anterior (evidencia archivada) y deja claro qué sorteo se auditó.
  const sufijoEvidencia = process.env.SIM_EVIDENCE_SUFFIX
    ? `-${escenario}${process.env.SIM_EVIDENCE_SUFFIX}`
    : escenario === "F" && tituloArg
      ? "-F-destornilladores"
      : `-${escenario}`;
  const corrida = crearCorrida(sufijoEvidencia, { reiniciar: escenario === "F" });
  const ctx = { vars, admin, corrida, sorteo, numero: numeroArg, titulo: tituloArg };

  const inicio = iso();
  let salida;
  if (escenario === "A") salida = await escenarioA({ ...ctx, numeros: [3, 7] });
  if (escenario === "B") salida = await escenarioB(ctx);
  if (escenario === "C") salida = await escenarioC(ctx);
  if (escenario === "D") salida = await escenarioD(ctx);
  if (escenario === "F") salida = await escenarioF(ctx);

  const resumen = resumir(corrida.dir);
  writeFileSync(
    resolve(corrida.dir, `resultado-${escenario.toLowerCase()}.json`),
    JSON.stringify({ escenario, inicio, fin: iso(), resumen, salida }, null, 2),
    "utf8",
  );

  console.log(JSON.stringify({ escenario, resumen, evidencia: corrida.dir }, null, 2));
  if ((resumen.falla ?? 0) > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`FALLA: ${error.message}`);
  process.exit(1);
});
