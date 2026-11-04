/**
 * Captura de pantallas del panel con una sesión de admin de prueba.
 * Requiere haber corrido antes: node .design/make-admin-session.mjs
 *
 * Uso: node .design/admin-shot.mjs [baseUrl]
 * Guarda .design/shots/admin-*.png y avisa si alguna ruta redirige a /login.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/+$/, "");
const cookie = JSON.parse(readFileSync(join(tmpdir(), "gadu-admin-cookie.json"), "utf8"));
const outDir = ".design/shots";
mkdirSync(outDir, { recursive: true });

const port = 9337;
const profile = mkdtempSync(join(tmpdir(), "gadu-admin-shot-"));
const chrome = spawn(
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-crashpad",
    "--disable-breakpad",
    "--hide-scrollbars",
    "--disable-background-networking",
    "--disable-extensions",
    "--no-first-run",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
let msgId = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = (msgId += 1);
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

const pages = [
  { name: "dashboard", path: "/admin", width: 1440 },
  { name: "dashboard-390", path: "/admin", width: 390 },
  { name: "sorteos", path: "/admin/sorteos", width: 1440 },
  { name: "sorteos-390", path: "/admin/sorteos", width: 390 },
  { name: "resenas", path: "/admin/resenas", width: 1440 },
  { name: "verificacion", path: "/admin/verificacion", width: 1440 },
  { name: "design", path: "/admin/design", width: 1440 },
];

try {
  for (let i = 0; i < 80; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break;
    } catch {}
    await sleep(250);
  }
  const target = await (
    await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base + "/admin")}`, { method: "PUT" })
  ).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });

  await send("Page.enable");
  await send("Network.enable");
  const host = new URL(base).hostname;
  await send("Network.setCookie", {
    name: cookie.name,
    value: cookie.value,
    domain: host,
    path: "/",
    httpOnly: false,
    sameSite: "Lax",
  });

  // La cuenta de prueba nace sin dirección de entrega: completamos el gate
  // una sola vez (el perfil queda completo y el modal no vuelve a aparecer).
  await send("Page.navigate", { url: base + "/admin" });
  await sleep(3500);
  const fillResult = await send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      if (!document.body.innerText.includes("Dirección de recepción de premios")) return "sin gate";
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      const inputs = [...document.querySelectorAll("input")];
      const values = ["+54 11 5555 0000", "Calle de prueba 123", "Buenos Aires", "CABA", "1000", "AR"];
      inputs.forEach((el, i) => {
        if (values[i] === undefined) return;
        setter.call(el, values[i]);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await wait(300);
      const btn = [...document.querySelectorAll("button")].find((b) => /Guardar dirección/i.test(b.textContent || ""));
      if (!btn) return "sin botón";
      btn.click();
      await wait(2500);
      return document.body.innerText.includes("Dirección de recepción de premios") ? "gate sigue" : "completado";
    })()`,
  });
  console.log("gate de dirección:", fillResult.result.value);
  await sleep(800);

  // Descartar el modal de bienvenida del organizador si aparece.
  const welcome = await send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const text = document.body.innerText;
      if (!/Bienvenido a tu panel/i.test(text)) return "sin modal";
      const btn = [...document.querySelectorAll("button")].find((b) => /Entendido/i.test(b.textContent || ""));
      if (btn) { btn.click(); await wait(900); return "cerrado"; }
      return "sin botón";
    })()`,
  });
  console.log("modal de bienvenida:", welcome.result.value);
  await sleep(600);

  for (const page of pages) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: page.width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: page.width < 600,
    });
    await send("Page.navigate", { url: base + page.path });
    await sleep(4500);

    const check = await send("Runtime.evaluate", {
      expression: `JSON.stringify({ url: location.pathname, h1: (document.querySelector("h1")||{}).textContent || "", login: location.pathname === "/login" })`,
      returnByValue: true,
    });
    const info = JSON.parse(check.result.value);
    if (info.login) {
      console.error(`SIN SESIÓN: ${page.path} redirigió a /login`);
      continue;
    }

    const metrics = await send("Page.getLayoutMetrics");
    const content = metrics.cssContentSize ?? metrics.contentSize;
    const shot = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: page.width, height: Math.min(Math.ceil(content.height), 12000), scale: 1 },
    });
    const file = join(outDir, `admin-${page.name}.png`);
    writeFileSync(file, Buffer.from(shot.data, "base64"));
    console.log(`${page.path} -> ${file} (${info.h1})`);
  }
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
}
