/**
 * Auditoría visual con Chrome DevTools Protocol.
 * Uso: node .design/audit.mjs <url> [width] [height] [out.png]
 * - Emula el viewport exacto (incluye móvil con viewport meta).
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
const port = 9333;
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

const expression = `(() => {
  const vw = window.innerWidth;
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      const cls = typeof el.className === "string" ? el.className.slice(0, 100) : "";
      out.push({ tag: el.tagName.toLowerCase(), cls, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), text: (el.textContent || "").trim().slice(0, 40) });
    }
  }
  const nodes = [...document.querySelectorAll("main h1, main h2, main section")].slice(0, 10).map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { tag: el.tagName.toLowerCase(), text: (el.textContent || "").trim().slice(0, 32), top: Math.round(r.top + window.scrollY), height: Math.round(r.height), font: cs.fontSize, color: cs.color };
  });
  return JSON.stringify({
    vw, vh,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
    overflow: out.slice(0, 20),
    nodes,
  }, null, 1);
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
  await sleep(6000);

  if (process.env.EXTRA_JS) {
    await send("Runtime.evaluate", { expression: process.env.EXTRA_JS });
    await sleep(800);
  }

  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  console.log(result.result.value);

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
        height: Math.min(Math.ceil(content.height), 12000),
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
