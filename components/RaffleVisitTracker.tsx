"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Registra una visita por pestaña/sesión de navegador para el embudo del
 * organizador. No guarda datos personales: solo raffle_id y timestamp.
 */
export function RaffleVisitTracker({ raffleId }: { raffleId: string }) {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const key = `gadu:visited:${raffleId}`;

    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Sin sessionStorage: se registra igual (puede contar de más).
    }

    const supabase = createClient();
    void supabase
      .from("raffle_visits")
      .insert({ raffle_id: raffleId })
      .then(({ error }) => {
        if (error) {
          console.error("[visits] no se pudo registrar:", error.message);
        }
      });
  }, [raffleId]);

  return null;
}
