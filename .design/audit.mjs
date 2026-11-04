/**
 * Auditoría visual con Chrome DevTools Protocol.
 * Uso: node .design/audit.mjs <url> [width] [height] [out.png]
 * - Emula el viewport exacto (incluye móvil con viewport meta).
 * - Recorre la página para disparar el lazy-loading de imágenes.
 * - Reporta overflow horizontal y las primeras secciones de <main>.
 * - Si se pasa out.png, guarda una captura de página completa.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2] ?? "http://localhost:3100/";
const width = Number(process.argv[3] ?? 390);
const height = Number(process.argv[4] ?? 900);
const outFile = process.argv[5] ?? null;
const port = 9334;
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = mkdtempSync(join(tmpdir(), "gadu-cdp-"));

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-crashpad",
    "--disable-breakpad",
    "--hide-scrollbars",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    `--remote-debugging-port=${port}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForChrome() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome no respondió");
}

let ws;
let msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = (msgId += 1);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

/** Recorre la página de arriba a abajo para que next/image cargue todo. */
const scrollExpression = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const root = document.documentElement;
  const prevBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  const total = document.body.scrollHeight;
  for (let y = 0; y < total; y += Math.round(window.innerHeight * 0.8)) {
    window.scrollTo(0, y);
    await wait(140);
  }
  window.scrollTo(0, 0);
  root.scrollTop = 0;
  root.style.scrollBehavior = prevBehavior;
  await wait(1200);
  return "ok";
})()`;

const auditExpression = `(() => {
  try {
    const vw = window.innerWidth;
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        const cls = typeof el.className === "string" ? el.className.slice(0, 90) : "";
        out.push({ tag: el.tagName.toLowerCase(), cls, left: Math.round(r.left), right: Math.round(r.right), text: (el.textContent || "").trim().slice(0, 30) });
      }
    }
    const imgs = [...document.images].map((img) => ({
      src: (img.currentSrc || img.src || "").split("/").pop(),
      w: img.naturalWidth,
      h: img.naturalHeight,
      complete: img.complete,
    }));
    return JSON.stringify({
      vw,
      docScrollWidth: document.documentElement.scrollWidth,
      docScrollHeight: document.documentElement.scrollHeight,
      overflow: out.slice(0, 15),
      images: imgs.slice(0, 40),
    }, null, 1);
  } catch (err) {
    return "ERR " + (err && err.message ? err.message : String(err));
  }
})()`;

try {
  await waitForChrome();
  const createRes = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,
    { method: "PUT" },
  );
  const target = await createRes.json();

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
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
  await send("Page.navigate", { url });
  await sleep(5000);

  await send("Runtime.evaluate", {
    expression: scrollExpression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (process.env.EXTRA_JS) {
    await send("Runtime.evaluate", { expression: process.env.EXTRA_JS });
    await sleep(1200);
  }

  const result = await send("Runtime.evaluate", {
    expression: auditExpression,
    returnByValue: true,
  });
  console.log(result.result.value ?? JSON.stringify(result));

  if (outFile) {
    const metrics = await send("Page.getLayoutMetrics");
    const content = metrics.cssContentSize ?? metrics.contentSize;
    const shot = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width,
        height: Math.min(Math.ceil(content.height), 14000),
        scale: 1,
      },
    });
    writeFileSync(outFile, Buffer.from(shot.data, "base64"));
    console.error(`SHOT ${outFile} ${width}x${Math.ceil(content.height)}`);
  }
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
}
