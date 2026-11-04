/**
 * Crea (o reutiliza) una cuenta de admin de PRUEBA y genera una sesión local
 * para poder renderizar /admin. No imprime secretos.
 *
 * Uso: node .design/make-admin-session.mjs
 * Salida: $TEMP/gadu-admin-cookie.json  (cookie de sesión de corta vida)
 *
 * Limpieza: node .design/delete-admin-account.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const email = process.env.QA_ADMIN_EMAIL ?? "qa.panel@gadu.test";
const password =
  process.env.QA_ADMIN_PASSWORD ??
  `Qa-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

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
const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local");
  process.exit(1);
}

const serviceHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function createOrFindUser() {
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Admin de prueba (diseño)" },
    }),
  });
  if (created.ok) return (await created.json()).user ?? (await created.json());

  const list = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: serviceHeaders,
  });
  const data = await list.json();
  const found = (data.users ?? []).find((u) => u.email === email);
  if (!found) throw new Error(`No se pudo crear ni encontrar ${email}: ${created.status} ${await created.text()}`);

  // Reutilizada: actualizamos la contraseña para poder pedir una sesión.
  await fetch(`${url}/auth/v1/admin/users/${found.id}`, {
    method: "PUT",
    headers: serviceHeaders,
    body: JSON.stringify({ password }),
  });
  return found;
}

async function ensureAdminProfile(user) {
  const profile = {
    id: user.id,
    email,
    full_name: "Admin de prueba (diseño)",
    role: "admin",
    phone: "+54 11 5555 0000",
    address_line: "Calle de prueba 123",
    city: "Buenos Aires",
    province: "CABA",
    postal_code: "1000",
    country: "AR",
    terms_accepted_at: new Date().toISOString(),
    terms_version: "1.0",
  };
  const res = await fetch(`${url}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: { ...serviceHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error(`Perfil admin: ${res.status} ${await res.text()}`);
}

async function signIn() {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login de prueba: ${res.status} ${await res.text()}`);
  return res.json();
}

function cookieFromSession(session) {
  const projectRef = new URL(url).hostname.split(".")[0];
  const name = `sb-${projectRef}-auth-token`;
  const value = JSON.stringify({
    access_token: session.access_token,
    token_type: session.token_type ?? "bearer",
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  });
  const encoded = "base64-" + Buffer.from(value, "utf8").toString("base64url");
  return { name, value: encoded };
}

let user = null;
if (serviceKey) {
  user = await createOrFindUser();
  await ensureAdminProfile(user);
} else {
  console.log("Sin service key: se reutiliza la cuenta ya creada a mano.");
}

const session = await signIn();
user = user ?? session.user;

// Verificar el rol real: la app redirige a / si no es admin.
const profRes = await fetch(
  `${url}/rest/v1/profiles?select=role&id=eq.${session.user.id}`,
  { headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` } },
);
const profiles = await profRes.json();
const role = Array.isArray(profiles) ? profiles[0]?.role ?? "desconocido" : "desconocido";
console.log(`rol del perfil: ${role}`);

const cookie = cookieFromSession(session);
const out = join(tmpdir(), "gadu-admin-cookie.json");
writeFileSync(out, JSON.stringify({ ...cookie, email, userId: session.user.id }, null, 1), "utf8");

console.log(JSON.stringify({
  ok: true,
  email,
  role,
  userId: session.user.id,
  cookieName: cookie.name,
  cookieLength: cookie.value.length,
  cookieFile: out,
}, null, 1));

if (role !== "admin" && role !== "superadmin") {
  console.error("El perfil no tiene rol admin: ejecutá el UPDATE en el SQL Editor.");
  process.exit(3);
}
