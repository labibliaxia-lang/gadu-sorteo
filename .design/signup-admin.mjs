/**
 * Crea una cuenta de admin de prueba por el endpoint público de signup
 * (email provider habilitado) y guarda la cookie de sesión local.
 *
 * Uso: node .design/signup-admin.mjs
 * Imprime solo datos no sensibles + el email que hay que promover a admin.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const email = process.env.QA_ADMIN_EMAIL ?? "qa.panel2@gadu.test";
const password = process.env.QA_ADMIN_PASSWORD ?? "G7#k9Xm2P!qZ8@v4Lw3Yx$p7A";

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
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const signup = await fetch(`${url}/auth/v1/signup`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({
    email,
    password,
    data: { accepted_terms: true, full_name: "Admin de prueba (diseño)", terms_version: "1.0" },
  }),
});

let session = await signup.json();

// Si la cuenta ya existe, hacemos login normal.
if (!signup.ok || !session.access_token) {
  const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  session = await login.json();
  if (!login.ok || !session.access_token) {
    console.error(`Login falló: ${login.status} ${JSON.stringify(session)}`);
    process.exit(1);
  }
}

const projectRef = new URL(url).hostname.split(".")[0];
const value = JSON.stringify({
  access_token: session.access_token,
  token_type: session.token_type ?? "bearer",
  expires_in: session.expires_in,
  expires_at: session.expires_at,
  refresh_token: session.refresh_token,
  user: session.user,
});
const cookie = {
  name: `sb-${projectRef}-auth-token`,
  value: "base64-" + Buffer.from(value, "utf8").toString("base64url"),
  email,
  userId: session.user.id,
};
writeFileSync(join(tmpdir(), "gadu-admin-cookie.json"), JSON.stringify(cookie, null, 1), "utf8");

const prof = await fetch(`${url}/rest/v1/profiles?select=role&id=eq.${session.user.id}`, {
  headers: { apikey: anon, Authorization: `Bearer ${session.access_token}` },
});
const rows = await prof.json();
console.log(JSON.stringify({
  email,
  userId: session.user.id,
  role: Array.isArray(rows) ? rows[0]?.role ?? null : null,
  cookieSaved: true,
}, null, 1));
