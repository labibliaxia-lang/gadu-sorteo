"use client";

import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

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

      const { error } = await supabase.from("referrals").insert({
        referrer_id: stored,
        referred_id: user.id,
      });

      // 23505 = vínculo ya existente (unique). En ambos casos limpiamos.
      if (!error || error.code === "23505") {
        localStorage.removeItem("gadu_referral");
      }
    }

    claim();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      claim();
    });

    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  return null;
}
