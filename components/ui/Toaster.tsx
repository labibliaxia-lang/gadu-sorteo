"use client";

import { Toaster as SonnerToaster } from "sonner";

/** Toasts globales (sonner). Se montan una vez en el layout raíz. */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      duration={5000}
      toastOptions={{ className: "text-sm" }}
    />
  );
}
