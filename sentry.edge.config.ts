import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  // Next usa errores internos para señalar un 404 (`notFound()`) o un
  // redirect. Son control de flujo, no fallos de la app: si llegan a Sentry,
  // el 404 esperado tapa los errores reales. El usuario igual recibe la
  // página correcta.
  ignoreErrors: [
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
    "NEXT_HTTP_ERROR_FALLBACK",
  ],
  environment: process.env.NODE_ENV,
  dataCollection: {
    userInfo: false,
  },
  tracesSampleRate: Number(
    process.env.SENTRY_TRACES_SAMPLE_RATE ??
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ??
      0.1,
  ),
});
