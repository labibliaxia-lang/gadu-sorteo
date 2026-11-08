import { defineRouting } from "next-intl/routing";

/**
 * Rutas localizadas solo para las páginas públicas migradas.
 *
 * - `as-needed`: el español (default) va sin prefijo; `en` y `pt` llevan
 *   `/en` y `/pt`.
 * - `localeDetection: false`: sin cookie ni `Accept-Language`. La URL manda.
 *   Así `/sorteos/x` siempre es español y no redirige solo a `/en/...`.
 */
export const routing = defineRouting({
  locales: ["es", "en", "pt"],
  defaultLocale: "es",
  localePrefix: "as-needed",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
