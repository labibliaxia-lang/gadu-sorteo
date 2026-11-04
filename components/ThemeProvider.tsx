"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * El sitio tiene una sola identidad: la mesa de sorteo oscura. El tema claro
 * queda como alternativa accesible, no como default según el sistema
 * operativo: una marca con personalidad no cambia de piel según el SO.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      themes={["dark", "light"]}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
