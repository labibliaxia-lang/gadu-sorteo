/**
 * Borra la cuenta de admin de prueba y su perfil.
 * Uso: node .design/delete-admin-account.mjs
 */
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const email = "qa.panel@gadu.test";
const envRaw = readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  envRaw
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim().replace(/^"(.*)"$/, "$1")];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

const list = await (await fetch(`${url}/auth/v1/admin/users?page=1&per_page=200`, { headers })).json();
const found = (list.users ?? []).find((u) => u.email === email);
if (!found) {
  console.log("No existe la cuenta de prueba.");
  process.exit(0);
}
await fetch(`${url}/rest/v1/profiles?id=eq.${found.id}`, { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" } });
const res = await fetch(`${url}/auth/v1/admin/users/${found.id}`, { method: "DELETE", headers });
console.log(`Cuenta ${email} eliminada: ${res.ok ? "ok" : res.status}`);
