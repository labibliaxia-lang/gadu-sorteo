import * as Sentry from "@sentry/nextjs";

/**
 * Carga la configuración de Sentry en el runtime correspondiente.
 * Next.js 14 requiere `experimental.instrumentationHook` (ver next.config.js).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/** Captura errores de Server Components, Route Handlers y middleware. */
export const onRequestError = Sentry.captureRequestError;
