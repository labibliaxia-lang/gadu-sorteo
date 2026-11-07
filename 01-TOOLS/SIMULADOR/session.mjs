#!/usr/bin/env node
/**
 * Sesión sintética para las personas del dataset.
 *
 * PROBLEMA QUE RESUELVE: la app sólo permite entrar con Google o passkey
 * (`components/LoginForm.tsx`: no hay formulario de email/contraseña). Un
 * comprador sintético no puede autenticarse por UI.
 *
 * INTERVENCIÓN DE LABORATORIO (declarada, no disimulada):
 *   1. Creo el usuario con la Admin API (service_role) y `email_confirm: true`.
 *   2. Hago `signInWithPassword` por API para obtener la sesión.
 *   3. Inyecto la cookie `sb-<ref>-auth-token` en el contexto de Playwright.
 *
 * Lo que NO hago: usar service_role para saltarme pasos de usuario (reservar,
 * pagar, sortear). Esos los hace la persona en el navegador. La service_role
 * sólo se usa para crear la cuenta y para leer estado final.
 */

import { createClient } from "@supabase/supabase-js";

const SEPARADOR = "|";

/** La cookie de @supabase/ssr se parte en trozos si supera este tamaño. */
const TAMANO_TROZO = 3180;

export function crearAdmin(vars) {
  return createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function crearClientePublico(vars) {
  return createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function refProyecto(vars) {
  try {
    return new URL(vars.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL inválida");
  }
}

/** Crea (o reutiliza) el usuario con una contraseña conocida. */
export async function asegurarUsuario(admin, { email, password, metadata = {} }) {
  const { data: lista, error: errorLista } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (errorLista) throw new Error(`listUsers: ${errorLista.message}`);

  const existente = lista.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existente) return { id: existente.id, creado: false };

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return { id: data.user.id, creado: true };
}

/** Inicia sesión por API y devuelve la sesión cruda. */
export async function obtenerSesion(vars, { email, password }) {
  const cliente = crearClientePublico(vars);
  const { data, error } = await cliente.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInWithPassword ${email}: ${error.message}`);
  if (!data.session) throw new Error(`sin sesión para ${email}`);
  return data.session;
}

/**
 * Convierte una sesión de Supabase en cookies de navegador con el formato que
 * espera @supabase/ssr. Trocea si hace falta, igual que el servidor.
 */
export function cookiesDeSesion(vars, session, host) {
  const nombre = `sb-${refProyecto(vars)}-auth-token`;
  const valor = JSON.stringify(session);
  const cookies = [];

  if (valor.length <= TAMANO_TROZO) {
    cookies.push({ name: nombre, value: valor, domain: host, path: "/" });
  } else {
    for (let i = 0, parte = 0; i < valor.length; i += TAMANO_TROZO, parte += 1) {
      cookies.push({
        name: `${nombre}.${parte}`,
        value: valor.slice(i, i + TAMANO_TROZO),
        domain: host,
        path: "/",
      });
    }
  }

  return cookies;
}

/** Deja el contexto de Playwright con la sesión puesta. */
export async function inyectarSesion(contexto, vars, session) {
  const url = new URL(vars.NEXT_PUBLIC_URL ?? "http://localhost:3000");
  // Playwright exige `url` O (`domain` + `path`). Mezclarlos con domain:undefined
  // hace que rechace la cookie, así que armamos objetos limpios.
  const cookies = cookiesDeSesion(vars, session, url.hostname).map((c) => ({
    name: c.name,
    value: c.value,
    url: url.origin,
    httpOnly: false,
    secure: url.protocol === "https:",
    sameSite: "Lax",
  }));
  await contexto.addCookies(cookies);
  return cookies.map((c) => c.name);
}

export { SEPARADOR };
