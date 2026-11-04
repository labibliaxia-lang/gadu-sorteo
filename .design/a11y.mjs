/**
 * Auditoría de accesibilidad con CDP (sin dependencias externas).
 * Uso: node .design/a11y.mjs <url> [width]
 * Revisa jerarquía de encabezados, nombres accesibles, labels, ids duplicados,
 * tamaño de blancos táctiles y foco real por teclado (Tab).
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2] ?? "http://localhost:3100/";
const width = Number(process.argv[3] ?? 390);
const port = 9335;
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = mkdtempSync(join(tmpdir(), "gadu-a11y-"));

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
    `--window-size=${width},900`,
    `--remote-debugging-port=${port}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForChrome() {
  for (let i = 0; i < 80; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return;
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

const structure = `(() => {
  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => ({ level: Number(h.tagName[1]), text: h.textContent.trim().slice(0, 48) }));
  const images = [...document.images].filter((img) => !img.hasAttribute("alt") || (img.getAttribute("alt") === "" && !img.getAttribute("aria-hidden"))).map((img) => img.src.split("/").pop());
  const interactive = [...document.querySelectorAll("a[href],button,[role=button]")];
  const unnamed = interactive.filter((el) => {
    const name = (el.getAttribute("aria-label") || el.textContent || "").trim();
    return !name;
  }).map((el) => el.outerHTML.slice(0, 80));
  const unlabeledInputs = [...document.querySelectorAll("input,select,textarea")].filter((el) => {
    if (el.type === "hidden") return false;
    const id = el.id;
    const hasLabel = id && document.querySelector('label[for="' + id + '"]');
    return !(hasLabel || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby"));
  }).map((el) => (el.outerHTML || "").slice(0, 80));
  const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  const smallTargets = interactive.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (r.width < 32 || r.height < 32);
  }).map((el) => ({ text: (el.textContent || "").trim().slice(0, 24), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }));
  return JSON.stringify({ headings, imagesMissingAlt: images, unnamedButtons: unnamed, unlabeledInputs, duplicateIds: [...new Set(dupes)], smallTargets: smallTargets.slice(0, 12) });
})()`;

const focusProbe = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return JSON.stringify({ stop: true });
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const outlineVisible = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 1 && !/rgba\(0, 0, 0, 0\)/.test(cs.outlineColor);
  const shadowVisible = cs.boxShadow !== "none" && !/rgba\(0, 0, 0, 0\)/.test(cs.boxShadow);
  const visible = outlineVisible || shadowVisible;
  return JSON.stringify({
    tag: el.tagName.toLowerCase(),
    text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 32),
    outline: cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor,
    boxShadow: cs.boxShadow.slice(0, 70),
    visible,
    w: Math.round(r.width),
    h: Math.round(r.height),
  });
})()`;

try {
  await waitForChrome();
  const target = await (
    await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })
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
  if (process.env.ADMIN_COOKIE) {
    const c = JSON.parse(readFileSync(process.env.ADMIN_COOKIE, "utf8"));
    await send("Network.enable");
    await send("Network.setCookie", { name: c.name, value: c.value, domain: new URL(url).hostname, path: "/", httpOnly: false, sameSite: "Lax" });
  }
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await send("Page.navigate", { url });
  await sleep(5000);

  const s = await send("Runtime.evaluate", { expression: structure, returnByValue: true });
  console.log("== ESTRUCTURA ==");
  console.log(s.result.value ?? JSON.stringify(s));

  console.log("== FOCO POR TECLADO (primeros 22) ==");
  const stops = [];
  for (let i = 0; i < 22; i += 1) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await sleep(60);
    const probe = await send("Runtime.evaluate", { expression: focusProbe, returnByValue: true });
    const parsed = JSON.parse(probe.result.value);
    if (parsed.stop) break;
    stops.push(parsed);
  }
  for (const stop of stops) {
    console.log(`${stop.visible ? "OK " : "NO "} ${stop.tag.padEnd(7)} ${String(stop.w).padStart(4)}x${String(stop.h).padEnd(4)} "${stop.text}"  ${stop.outline}`.slice(0, 160));
  }
  console.log(`Foco invisible: ${stops.filter((s2) => !s2.visible).length} de ${stops.length}`);
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
}
