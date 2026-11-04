import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const url = "http://localhost:3100/login";
const port = 9444;
const profile = mkdtempSync(join(tmpdir(), "gadu-probe-"));
const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", ["--headless=new","--no-sandbox","--disable-gpu","--disable-crashpad","--disable-extensions","--hide-scrollbars",`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,"about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 80; i += 1) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {} await sleep(250); }
const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
const target = await res.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener("open", r, { once: true }); ws.addEventListener("error", j, { once: true }); });
let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } });
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(7000);
const expr = `JSON.stringify({
  htmlClass: document.documentElement.className,
  stored: localStorage.getItem("theme"),
  bodyBg: getComputedStyle(document.body).backgroundColor,
  link: (() => { const a = [...document.querySelectorAll("a")].find(x => /Términos/.test(x.textContent||"")); return a ? { cls: a.className, color: getComputedStyle(a).color } : null; })(),
  h1: (() => { const h = document.querySelector("h1"); return h ? { text: h.textContent, font: getComputedStyle(h).fontFamily, weight: getComputedStyle(h).fontWeight, size: getComputedStyle(h).fontSize, color: getComputedStyle(h).color } : null; })(),
  card: (() => { const c = document.querySelector(".rounded-2xl"); return c ? { bg: getComputedStyle(c).backgroundColor, border: getComputedStyle(c).borderColor, radius: getComputedStyle(c).borderRadius } : null; })()
})`;
const out = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
console.log(JSON.stringify(out, null, 1).slice(0, 2000));
ws.close(); chrome.kill();