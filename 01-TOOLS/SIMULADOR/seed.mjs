#!/usr/bin/env node
/**
 * Preparación de datos en el proyecto de PRUEBA.
 *
 * Lo único que hace acá: crear las cuentas de las personas y darle a Carla el
 * rol que necesita para entrar al panel. Nada de reservar, pagar ni sortear:
 * esos pasos los hace cada persona en el navegador.
 *
 * La contraseña es de laboratorio y vive en `.env.test.local` como
 * `SIM_PASSWORD`. No se usa en ningún otro lado.
 *
 * Uso: node seed.mjs
 */

import { cargarEnvTest } from "./env-guard.mjs";
import { crearAdmin, asegurarUsuario } from "./session.mjs";
import { pathToFileURL } from "node:url";

export const CUENTAS = [
  { id: "ana", email: "ana.ficticia@gadu.test", nombre: "Ana Ficticia Pérez", rol: "user", telefono: "+5491155550101" },
  { id: "bruno", email: "bruno.ficticio@gadu.test", nombre: "Bruno Ficticio Gómez", rol: "user", telefono: "+5491155550102" },
  { id: "eva", email: "eva.ficticia@gadu.test", nombre: "Eva Ficticia Duarte", rol: "user", telefono: "+5491155550105" },
  { id: "carla", email: "carla.ficticia@gadu.test", nombre: "Carla Ficticia Ríos", rol: "admin", telefono: "+5491155550103" },
];

const principal = async () => {
  const { vars } = cargarEnvTest();

  if (!vars.SIM_PASSWORD) {
    throw new Error("Falta SIM_PASSWORD en .env.test.local (contraseña de laboratorio).");
  }

  const admin = crearAdmin(vars);
  const hechos = [];

  for (const cuenta of CUENTAS) {
    const { id, creado } = await asegurarUsuario(admin, {
      email: cuenta.email,
      password: vars.SIM_PASSWORD,
      metadata: { full_name: cuenta.nombre, simulated: true },
    });

    // El perfil lo crea un trigger; el rol hay que ponerlo aparte.
    const { error } = await admin
      .from("profiles")
      .update({ role: cuenta.rol, full_name: cuenta.nombre })
      .eq("id", id);
    if (error) throw new Error(`profiles ${cuenta.email}: ${error.message}`);

    hechos.push({ cuenta: cuenta.id, email: cuenta.email, id, creado, rol: cuenta.rol });
  }

  console.log(JSON.stringify({ proyecto: vars.NEXT_PUBLIC_SUPABASE_URL, cuentas: hechos }, null, 2));
};

const ejecutadoDirecto =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (ejecutadoDirecto) {
  principal().catch((error) => {
    console.error(`FALLA: ${error.message}`);
    process.exit(1);
  });
}
