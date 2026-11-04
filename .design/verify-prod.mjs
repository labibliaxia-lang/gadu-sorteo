/**
 * Smoke test de producción: verifica que el deploy serva los assets de la
 * identidad nueva y captura la home en 390/1440 y ambos temas.
 * Uso: node .design/verify-prod.mjs [baseUrl]
 * Sale con código 1 si falta algún asset esperado.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = (process.argv[2] ?? "https://gadu-sorteo-doci.vercel.app").replace(/\/+$/, "");
const outDir = ".design/shots/prod";
mkdirSync(outDir, { recursive: true });

const assets = ["/logo-gadu-azul.png", "/logo-gadu-blanco.png"];
let failed = false;
for (const asset of assets) {
  try {
    const res = await fetch(base + asset, { method: "HEAD" });
    console.log(`${res.ok ? "OK " : "FALLA"} ${asset} -> ${res.status}`);
    if (!res.ok) failed = true;
  } catch (error) {
    console.log(`FALLA ${asset} -> ${error.message}`);
    failed = true;
  }
}

const html = await (await fetch(base + "/")).text();
const deployed = html.includes("logo-gadu-azul.png");
console.log(`${deployed ? "OK " : "FALLA"} la home referencia el logo nuevo`);
if (!deployed) failed = true;

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9336;
const profile = mkdtempSync(join(tmpdir(), "gadu-prod-"));
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
function send(method, params = {}) {
  const id = (msgId += 1);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

try {
  for (let i = 0; i < 80; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break;
    } catch {}
    await sleep(250);
  }
  const target = await (
    await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base + "/")}`, { method: "PUT" })
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

  for (const width of [390, 1440]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await send("Page.navigate", { url: base + "/" });
    await sleep(4500);
    // Recorrer la página para que next/image cargue las portadas lazy.
    await send("Runtime.evaluate", {
      awaitPromise: true,
      expression: `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        document.documentElement.style.scrollBehavior = "auto";
        for (let y = 0; y < document.body.scrollHeight; y += Math.round(innerHeight * 0.8)) {
          window.scrollTo(0, y);
          await wait(160);
        }
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        await wait(1200);
      })()`,
    });
    const metrics = await send("Page.getLayoutMetrics");
    const content = metrics.cssContentSize ?? metrics.contentSize;
    const shot = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height: Math.min(Math.ceil(content.height), 12000), scale: 1 },
    });
    const file = join(outDir, `home-${width}.png`);
    writeFileSync(file, Buffer.from(shot.data, "base64"));
    console.log(`captura ${file}`);
  }
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
}

if (failed) process.exit(1);
console.log("Producción sirve la identidad nueva.");
