#!/usr/bin/env node
/**
 * Barrido visual de las páginas públicas, sin base, sin sesión y sin tocar datos.
 *
 * Qué mide, por página y por ancho (375 / 768 / 1280):
 *  - errores de consola y excepciones sin capturar;
 *  - respuestas HTTP >= 400 y pedidos fallidos;
 *  - desborde horizontal real (scrollWidth > innerWidth) con la lista de culpables;
 *  - accesibilidad estructural: imágenes sin alt, controles sin nombre accesible,
 *    inputs sin etiqueta, jerarquía de títulos (h1 único, sin saltos);
 *  - contraste WCAG 2.1 AA calculado sobre color computado y fondo efectivo.
 *
 * Qué NO hace: no inicia sesión, no reserva, no paga, no escribe en Supabase.
 * Sólo GET a páginas públicas.
 *
 * Uso: node barrido-publicas.mjs [--base http://localhost:3000]
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "playwright";

import { crearCorrida } from "./evidence.mjs";

const argBase = process.argv.indexOf("--base");
const BASE = argBase > -1 ? process.argv[argBase + 1] : process.env.QA_BASE ?? "http://localhost:3000";

// QA_TEMA=light|dark fuerza el tema (next-themes guarda la preferencia en
// localStorage). QA_SOLO=home,planes limita las páginas. QA_SUFIJO cambia la
// carpeta de evidencia para no pisar la corrida anterior.
const TEMA = process.env.QA_TEMA ?? "";
const SUFIJO = process.env.QA_SUFIJO ?? "-visual-publicas";
const SOLO = (process.env.QA_SOLO ?? "").split(",").filter(Boolean);

const corrida = crearCorrida(SUFIJO, { reiniciar: true });

// Cada entrada: ruta, nombre corto y qué debería verse. `null` = se acepta cualquier estado.
const TODAS = [
  { ruta: "/", nombre: "home", esperado: "landing con hero y sorteos destacados" },  { ruta: "/como-funciona", nombre: "como-funciona", esperado: "explicación del ciclo de compra" },
  { ruta: "/ayuda", nombre: "ayuda", esperado: "preguntas frecuentes" },
  { ruta: "/planes", nombre: "planes", esperado: "planes y precios visibles" },
  { ruta: "/ganadores", nombre: "ganadores", esperado: "lista de ganadores o estado vacío" },
  { ruta: "/privacidad", nombre: "privacidad", esperado: "texto legal" },
  { ruta: "/terminos", nombre: "terminos", esperado: "texto legal" },
  { ruta: "/seguridad", nombre: "seguridad", esperado: "texto de seguridad" },
  { ruta: "/login", nombre: "login", esperado: "formulario de ingreso" },
  { ruta: "/register", nombre: "register", esperado: "formulario de registro" },
  { ruta: "/sorteos/auto-2-demo", nombre: "sorteo-activo", esperado: "detalle con grilla de números" },
  { ruta: "/sorteos/sorteo-auto-demo", nombre: "sorteo-activo-2", esperado: "detalle con grilla de números" },
  { ruta: "/sorteos/auto-2026-demo", nombre: "sorteo-sorteado", esperado: "detalle con resultado" },
  { ruta: "/sorteos/auto-2026-demo/verificar", nombre: "verificar", esperado: "verificación del resultado" },
  { ruta: "/sorteos/auto-2026-demo/en-vivo", nombre: "en-vivo", esperado: "sala en vivo o redirección honesta" },
  { ruta: "/organizador/franco-maldonado-gadu", nombre: "organizador", esperado: "perfil público del organizador" },
];

const PAGINAS = SOLO.length ? TODAS.filter((p) => SOLO.includes(p.nombre)) : TODAS;

const ANCHOS = [
  { id: "375", width: 375, height: 812 },
  { id: "768", width: 768, height: 1024 },
  { id: "1280", width: 1280, height: 800 },
];

// Páginas que además se capturan enteras: son las que deciden la primera impresión.
const COMPLETAS = new Set(["home", "sorteo-activo", "sorteo-sorteado", "verificar", "organizador", "login"]);

const normalizar = (u) => u.replace(BASE, "");

/** Todo lo que corre dentro de la página. Devuelve un objeto serializable. */
function auditar() {
  const rgb = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((n) => parseFloat(n));
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
    return (hi + 0.05) / (lo + 0.05);
  };
  const mezclar = (frente, fondo) => ({
    r: frente.r * frente.a + fondo.r * (1 - frente.a),
    g: frente.g * frente.a + fondo.g * (1 - frente.a),
    b: frente.b * frente.a + fondo.b * (1 - frente.a),
    a: 1,
  });
  const camino = (el) => {
    const partes = [];
    let n = el;
    let prof = 0;
    while (n && n.nodeType === 1 && prof < 4) {
      let s = n.tagName.toLowerCase();
      if (n.id) {
        return [s + "#" + n.id, ...partes].join(" > ");
      }
      const cls = typeof n.className === "string" ? n.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
      if (cls.length) s += "." + cls.join(".");
      const p = n.parentElement;
      if (p) s += ":nth-child(" + ([...p.children].indexOf(n) + 1) + ")";
      partes.unshift(s);
      n = n.parentElement;
      prof++;
    }
    return partes.join(" > ");
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const textoPropio = (el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);

  const anchoVentana = window.innerWidth;
  const anchoDoc = document.documentElement.scrollWidth;

  // --- desborde horizontal: quién se pasa del ancho visible
  const desbordes = [];
  const vistos = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > anchoVentana + 1 || r.left < -1) {
      const sel = camino(el);
      if (vistos.has(sel)) continue;
      vistos.add(sel);
      const padre = el.parentElement ? el.parentElement.getBoundingClientRect() : null;
      const padreDesborda = padre && (padre.right > anchoVentana + 1 || padre.left < -1);
      if (padreDesborda) continue; // se reporta el contenedor, no cada hijo
      desbordes.push({
        selector: sel,
        izquierda: Math.round(r.left),
        derecha: Math.round(r.right),
        ancho: Math.round(r.width),
      });
      if (desbordes.length >= 12) break;
    }
  }

  // --- imágenes sin alt
  const sinAlt = [];
  for (const img of document.images) {
    if (!visible(img)) continue;
    if (img.getAttribute("alt") === null) {
      sinAlt.push({ selector: camino(img), src: (img.currentSrc || img.src).slice(-90) });
    }
  }

  // --- controles sin nombre accesible
  const sinNombre = [];
  for (const el of document.querySelectorAll("button, a, [role=button]")) {
    if (!visible(el)) continue;
    const texto = (el.innerText ?? "").trim();
    const etiqueta = el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "";
    const altHijo = [...el.querySelectorAll("img")].some((i) => (i.getAttribute("alt") ?? "").trim());
    if (!texto && !etiqueta.trim() && !altHijo) {
      sinNombre.push({ selector: camino(el), tag: el.tagName.toLowerCase(), href: el.getAttribute("href") ?? "" });
    }
    if (sinNombre.length >= 12) break;
  }

  // --- inputs sin etiqueta
  const sinEtiqueta = [];
  for (const el of document.querySelectorAll("input, select, textarea")) {
    if (!visible(el)) continue;
    const tipo = (el.getAttribute("type") ?? "").toLowerCase();
    if (["hidden", "submit", "button", "image"].includes(tipo)) continue;
    const id = el.id;
    const conLabel = id && document.querySelector('label[for="' + CSS.escape(id) + '"]');
    const aria = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
    const envuelto = el.closest("label");
    if (!conLabel && !aria && !envuelto) {
      sinEtiqueta.push({ selector: camino(el), tipo: tipo || el.tagName.toLowerCase() });
    }
    if (sinEtiqueta.length >= 10) break;
  }

  // --- jerarquía de títulos
  const titulos = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => ({
    nivel: Number(h.tagName[1]),
    texto: (h.innerText ?? "").trim().slice(0, 60),
  }));
  const saltos = [];
  let previo = 0;
  for (const t of titulos) {
    if (previo && t.nivel - previo > 1) saltos.push({ de: "h" + previo, a: "h" + t.nivel, texto: t.texto });
    previo = t.nivel;
  }

  // --- contraste AA
  //
  // El fondo se compone bien: se busca la capa opaca más externa y desde ahí se
  // aplican las translúcidas hacia adentro. Componer contra blanco (lo obvio)
  // inventa grises que no existen y acusa fallos falsos.
  const fallosContraste = [];
  const noMedibles = [];
  const comoTexto = (c) => "rgb(" + Math.round(c.r) + "," + Math.round(c.g) + "," + Math.round(c.b) + ")";

  for (const el of document.querySelectorAll("body *")) {
    if (!textoPropio(el) || !visible(el)) continue;
    const cs = getComputedStyle(el);
    const propio = rgb(cs.color);
    if (!propio || propio.a === 0) continue;

    const capas = [];
    let conImagenDeFondo = false;
    let n = el;
    while (n && n.nodeType === 1) {
      const cn = getComputedStyle(n);
      if (cn.backgroundImage && cn.backgroundImage !== "none") {
        conImagenDeFondo = true;
        break;
      }
      const c = rgb(cn.backgroundColor);
      if (c && c.a > 0) capas.push(c);
      n = n.parentElement;
    }
    if (conImagenDeFondo) continue; // no se puede calcular: hay un degradé debajo

    let opaca = -1;
    for (let i = capas.length - 1; i >= 0; i--) {
      if (capas[i].a >= 1) {
        opaca = i;
        break;
      }
    }
    let fondo;
    if (opaca >= 0) {
      fondo = { ...capas[opaca], a: 1 };
      for (let i = opaca - 1; i >= 0; i--) fondo = mezclar(capas[i], fondo);
    } else {
      fondo = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = capas.length - 1; i >= 0; i--) fondo = mezclar(capas[i], fondo);
    }

    // Texto semitransparente: el color real es el texto compuesto sobre el fondo.
    const colorTexto = propio.a >= 1 ? propio : mezclar(propio, fondo);

    const tamano = parseFloat(cs.fontSize);
    const peso = parseInt(cs.fontWeight, 10) || 400;
    const grande = tamano >= 24 || (tamano >= 18.66 && peso >= 700);
    const minimo = grande ? 3 : 4.5;
    const r = ratio(colorTexto, fondo);
    if (r >= minimo) continue;

    // Antes de acusar: ¿hay una foto/overlay debajo? (imagen hermana, no fondo CSS)
    const caja = el.getBoundingClientRect();
    let imagenDebajo = false;
    const x = Math.min(window.innerWidth - 1, Math.max(0, caja.left + caja.width / 2));
    const y = Math.min(window.innerHeight - 1, Math.max(0, caja.top + caja.height / 2));
    for (const t of document.elementsFromPoint(x, y)) {
      if (t === el) continue;
      if (["IMG", "VIDEO", "CANVAS", "PICTURE"].includes(t.tagName)) {
        imagenDebajo = true;
        break;
      }
      const cb = getComputedStyle(t);
      if (cb.backgroundImage && cb.backgroundImage !== "none") {
        imagenDebajo = true;
        break;
      }
      if (t.contains(el)) break; // ya salimos del árbol del texto
    }

    const fila = {
      selector: camino(el),
      texto: (el.innerText ?? "").trim().slice(0, 40),
      color: cs.color,
      fondo: comoTexto(fondo),
      ratio: Math.round(r * 100) / 100,
      minimo,
      tamanoPx: Math.round(tamano * 10) / 10,
    };
    if (imagenDebajo) {
      noMedibles.push({ ...fila, motivo: "texto sobre imagen u overlay: el CSS no alcanza" });
    } else {
      fallosContraste.push(fila);
    }
    if (fallosContraste.length >= 20) break;
  }

  return {
    url: location.href,
    titulo: document.title,
    metaDescripcion: document.querySelector('meta[name="description"]')?.content ?? null,
    anchoVentana,
    anchoDoc,
    desborde: anchoDoc > anchoVentana + 1,
    desbordes,
    sinAlt,
    sinNombre,
    sinEtiqueta,
    h1: titulos.filter((t) => t.nivel === 1).length,
    titulos,
    saltosTitulos: saltos,
    fallosContraste,
    noMedibles,
  };
}

const navegador = await chromium.launch({ headless: true });
const resultados = [];

try {
  for (const pagina of PAGINAS) {
    for (const ancho of ANCHOS) {
      const contexto = await navegador.newContext({
        viewport: { width: ancho.width, height: ancho.height },
        locale: "es-AR",
        timezoneId: "America/Argentina/Buenos_Aires",
        userAgent: "gadu-qa-visual/1.0 (headless chromium)",
      });
      const page = await contexto.newPage();
      if (TEMA) {
        // next-themes lee la preferencia de localStorage antes de pintar.
        await contexto.addInitScript((t) => {
          try {
            window.localStorage.setItem("theme", t);
          } catch {
            /* sin storage: se mide el tema por defecto */
          }
        }, TEMA);
      }
      const consola = [];
      const excepciones = [];
      const fallidos = [];
      const http = [];

      page.on("console", (m) => {
        if (m.type() === "error") consola.push(m.text().slice(0, 300));
      });
      page.on("pageerror", (e) => excepciones.push(String(e).slice(0, 300)));
      page.on("requestfailed", (r) => {
        const u = r.url();
        if (u.includes("/_next/webpack-hmr") || u.startsWith("ws:")) return;
        fallidos.push({ url: normalizar(u), error: r.failure()?.errorText ?? "" });
      });
      page.on("response", (r) => {
        if (r.status() >= 400) http.push({ status: r.status(), url: normalizar(r.url()) });
      });

      const paso = corrida.abrir({
        paso: `${pagina.nombre}-${ancho.id}`,
        rol: "visitante anónimo",
        esperado: pagina.esperado,
      });

      const inicio = Date.now();
      let estado = null;
      let errorNavegacion = null;
      let datos = null;
      const archivos = [];

      try {
        const resp = await page.goto(BASE + pagina.ruta, { waitUntil: "load", timeout: 60000 });
        estado = resp ? resp.status() : null;
        await page.waitForTimeout(1200);
        datos = await page.evaluate(auditar);
        const urlFinal = normalizar(page.url());

        const base = `${pagina.nombre}-${ancho.id}${TEMA ? "-" + TEMA : ""}`;
        await page.screenshot({
          path: resolve(corrida.capturas, `${base}.jpg`),
          type: "jpeg",
          quality: 70,
        });
        archivos.push(`capturas/${base}.jpg`);

        if (COMPLETAS.has(pagina.nombre) && (ancho.id === "375" || ancho.id === "1280")) {
          await page.screenshot({
            path: resolve(corrida.capturas, `${base}-entera.jpg`),
            type: "jpeg",
            quality: 65,
            fullPage: true,
          });
          archivos.push(`capturas/${base}-entera.jpg`);
        }

        const httpGraves = http.filter((h) => h.status >= 500);
        const httpMedios = http.filter((h) => h.status >= 400 && h.status < 500);
        const problemas = [];
        if (estado && estado >= 400) problemas.push(`HTTP ${estado} en la página`);
        if (httpGraves.length) problemas.push(`${httpGraves.length} respuesta(s) 5xx`);
        if (excepciones.length) problemas.push(`${excepciones.length} excepción(es) sin capturar`);
        if (consola.length) problemas.push(`${consola.length} error(es) de consola`);
        if (datos.desborde) problemas.push(`desborde horizontal (${datos.anchoDoc} > ${datos.anchoVentana})`);
        if (httpMedios.length) problemas.push(`${httpMedios.length} respuesta(s) 4xx`);
        if (datos.sinAlt.length) problemas.push(`${datos.sinAlt.length} imagen(es) sin alt`);
        if (datos.sinNombre.length) problemas.push(`${datos.sinNombre.length} control(es) sin nombre`);
        if (datos.sinEtiqueta.length) problemas.push(`${datos.sinEtiqueta.length} campo(s) sin etiqueta`);
        if (datos.fallosContraste.length) problemas.push(`${datos.fallosContraste.length} texto(s) bajo contraste`);
        if (datos.saltosTitulos.length) problemas.push(`${datos.saltosTitulos.length} salto(s) de título`);
        if (datos.h1 === 0) problemas.push("sin h1");
        if (datos.h1 > 1) problemas.push(`${datos.h1} h1`);

        const graves = Boolean(
          (estado && estado >= 400) ||
            httpGraves.length ||
            excepciones.length ||
            consola.length ||
            datos.desborde,
        );
        const resultado = graves ? "falla" : problemas.length ? "parcial" : "ok";

        paso.cerrar({
          observado: `HTTP ${estado} · ${urlFinal} · ${problemas.length ? problemas.join("; ") : "sin hallazgos"}`,
          resultado,
          evidencia: archivos,
          nota: `ancho ${ancho.width}px · ${Date.now() - inicio}ms`,
        });

        resultados.push({
          pagina: pagina.nombre,
          ruta: pagina.ruta,
          urlFinal,
          ancho: ancho.width,
          estado,
          duracionMs: Date.now() - inicio,
          resultado,
          problemas,
          consola,
          excepciones,
          fallidos,
          http,
          metricas: datos
            ? {
                titulo: datos.titulo,
                metaDescripcion: datos.metaDescripcion,
                anchoDoc: datos.anchoDoc,
                h1: datos.h1,
                desborde: datos.desborde,
                desbordes: datos.desbordes,
                sinAlt: datos.sinAlt,
                sinNombre: datos.sinNombre,
                sinEtiqueta: datos.sinEtiqueta,
                saltosTitulos: datos.saltosTitulos,
                fallosContraste: datos.fallosContraste,
                noMedibles: datos.noMedibles,
                titulos: datos.titulos.slice(0, 12),
              }
            : null,
          capturas: archivos,
        });
      } catch (e) {
        errorNavegacion = String(e).slice(0, 400);
        paso.cerrar({
          observado: `no se pudo medir: ${errorNavegacion}`,
          resultado: "falla",
          evidencia: [],
          nota: `ancho ${ancho.width}px`,
        });
        resultados.push({
          pagina: pagina.nombre,
          ruta: pagina.ruta,
          ancho: ancho.width,
          estado,
          resultado: "falla",
          problemas: [`navegación fallida: ${errorNavegacion}`],
          capturas: [],
        });
      } finally {
        await contexto.close();
      }
    }
  }
} finally {
  await navegador.close();
}

// --- resumen
const total = resultados.length;
const cuenta = resultados.reduce((acc, r) => {
  acc[r.resultado] = (acc[r.resultado] ?? 0) + 1;
  return acc;
}, {});
const porPagina = PAGINAS.map((p) => {
  const filas = resultados.filter((r) => r.pagina === p.nombre);
  return {
    pagina: p.nombre,
    ruta: p.ruta,
    resultados: filas.map((f) => `${f.ancho}px:${f.resultado}`).join(" "),
    problemas: [...new Set(filas.flatMap((f) => f.problemas ?? []))],
  };
});

const salida = {
  base: BASE,
  tema: TEMA || "por defecto",
  corrida: corrida.dir,
  fecha: new Date().toISOString(),
  total,
  cuenta,
  porPagina,
  resultados,
};
writeFileSync(resolve(corrida.dir, "barrido.json"), JSON.stringify(salida, null, 2) + "\n", "utf8");

const lineas = [
  `# Barrido visual de públicas — ${new Date().toISOString().slice(0, 10)}`,
  "",
  `Base: ${BASE}`,
  `Tema: ${TEMA || "por defecto"}`,
  `Combinaciones: ${total} (${PAGINAS.length} páginas × ${ANCHOS.length} anchos)`,
  "",
  `Resultado: ${cuenta.ok ?? 0} ok · ${cuenta.parcial ?? 0} parcial · ${cuenta.falla ?? 0} falla`,
  "",
  "| Página | Ruta | Por ancho | Hallazgos |",
  "|---|---|---|---|",
];
for (const p of porPagina) {
  lineas.push(`| ${p.pagina} | \`${p.ruta}\` | ${p.resultados} | ${p.problemas.join("; ") || "—"} |`);
}
writeFileSync(resolve(corrida.dir, "resumen.md"), lineas.join("\n") + "\n", "utf8");

console.log(`corrida: ${corrida.dir}`);
console.log(`ok=${cuenta.ok ?? 0} parcial=${cuenta.parcial ?? 0} falla=${cuenta.falla ?? 0}`);
for (const p of porPagina) {
  console.log(`${p.resultados.padEnd(30)} ${p.ruta}  ${p.problemas.slice(0, 3).join(" | ")}`);
}
process.exit(cuenta.falla ? 1 : 0);
