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

/** Los enlaces viejos guardaban el UUID; los nuevos, un código de 6 letras. */
const UUID_REF =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Captura el parámetro ?ref= de la URL, lo guarda en localStorage y, cuando el
 * usuario está autenticado, registra el vínculo de referido.
 *
 * Desde 0120 el valor puede ser un código corto (`/r/<code>`): se traduce a
 * UUID con `resolver_referral_code` antes de insertar. Un `?ref=<uuid>` viejo
 * sigue funcionando sin cambios.
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

      // Código corto → UUID. La RPC sólo devuelve el id del referente.
      async function resolverReferente(valor: string) {
        if (UUID_REF.test(valor)) {
          return { id: valor, error: false as const };
        }

        const { data, error } = await supabase.rpc(
          "resolver_referral_code",
          { p_code: valor },
        );

        return {
          id: (typeof data === "string" ? data : null) as string | null,
          error: Boolean(error),
        };
      }

      const { id: referrerId, error: errorCodigo } =
        await resolverReferente(stored);

      // Código inexistente: se descarta para no reintentarlo en cada
      // navegación. Un error de red sí se conserva y se reintenta.
      if (!referrerId) {
        if (!errorCodigo) localStorage.removeItem("gadu_referral");
        return;
      }

      // No auto-referirse.
      if (referrerId === user.id) {
        localStorage.removeItem("gadu_referral");
        return;
      }

      const clave = `${referrerId}:${user.id}`;
      if (enVuelo.has(clave)) return;
      enVuelo.add(clave);

      try {
        // Upsert con «ignore duplicates»: si el vínculo ya existe, PostgREST
        // responde 201 en vez de 409. Es atómico y no depende de leer antes.
        const { error } = await supabase.from("referrals").upsert(
          { referrer_id: referrerId, referred_id: user.id },
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
            referrer_id: referrerId,
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
