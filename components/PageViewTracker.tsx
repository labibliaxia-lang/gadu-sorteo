"use client";

import { useEffect, useRef } from "react";

import { TRACK_VISIT_ENDPOINT } from "@/lib/page-views";

/**
 * Registra una vista por pestaña/sesión para las métricas de tráfico.
 *
 * Sin UI y a prueba de fallos: si el navegador bloquea sessionStorage, el
 * endpoint falla o la tabla no existe, la página sigue funcionando igual. La
 * identidad (user_id) la resuelve el servidor, nunca el cliente.
 */
export function PageViewTracker({ path }: { path: string }) {
  const done = useRef(false);

  useEffect(() => {
    // En desarrollo StrictMode monta dos veces: se manda una sola vez.
    if (done.current) return;
    done.current = true;

    const key = `gadu:page-view:${path}`;

    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Sin sessionStorage se registra igual (puede contar de más).
    }

    try {
      void fetch(TRACK_VISIT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
        credentials: "same-origin",
        keepalive: true,
      }).catch((error) => {
        console.warn("[page-views] no se pudo registrar la visita:", error);
      });
    } catch (error) {
      console.warn("[page-views] no se pudo registrar la visita:", error);
    }
  }, [path]);

  return null;
}
