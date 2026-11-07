"use client";

import { useEffect } from "react";

/**
 * Registra el service worker de la PWA. Solo en el navegador y en producción
 * (en dev estorba con el HMR). No muestra UI: el prompt de instalación lo
 * decide el navegador cuando se cumplen los requisitos.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("[pwa] no se pudo registrar el service worker", error);
      });
    };

    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar, { once: true });
  }, []);

  return null;
}
