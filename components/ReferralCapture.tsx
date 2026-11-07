"use client";

import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Cola de vínculos en vuelo, por par referente→invitado.
 *
 * El efecto corre al montar y otra vez en cada cambio de sesión; con dos
 * claims simultáneos, el segundo INSERT chocaba contra el unique y dejaba un
 * 409 en consola (aunque el vínculo ya estuviera creado). El guard es por
 * par: dos personas distintas no se bloquean entre sí.
 */
const enVuelo = new Set<string>();

/**
 * Captura el parámetro ?ref=USER_ID de la URL, lo guarda en localStorage y,
 * cuando el usuario está autenticado, registra el vínculo de referido.
 */
export function ReferralCapture() {
  const supabase = createClient();

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) {
      localStorage.setItem("gadu_referral", ref);
    }

    async function claim() {
      const stored = localStorage.getItem("gadu_referral");
      if (!stored) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // No auto-referirse.
      if (stored === user.id) {
        localStorage.removeItem("gadu_referral");
        return;
      }

      const clave = `${stored}:${user.id}`;
      if (enVuelo.has(clave)) return;
      enVuelo.add(clave);

      try {
        // Upsert con «ignore duplicates»: si el vínculo ya existe, PostgREST
        // responde 201 en vez de 409. Es atómico y no depende de leer antes.
        const { error } = await supabase.from("referrals").upsert(
          { referrer_id: stored, referred_id: user.id },
          { onConflict: "referrer_id,referred_id", ignoreDuplicates: true },
        );

        if (!error) {
          localStorage.removeItem("gadu_referral");
          return;
        }

        // 42P10 = la base no tiene el unique todavía (0103/0118 sin aplicar).
        // Se cae al INSERT clásico y se tolera el duplicado (23505).
        if (error.code === "42P10") {
          const { error: errorInsert } = await supabase.from("referrals").insert({
            referrer_id: stored,
            referred_id: user.id,
          });
          if (!errorInsert || errorInsert.code === "23505") {
            localStorage.removeItem("gadu_referral");
          }
        }
      } finally {
        enVuelo.delete(clave);
      }
    }

    void claim();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void claim();
    });

    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  return null;
}
