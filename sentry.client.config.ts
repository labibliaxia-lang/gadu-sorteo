import * as Sentry from "@sentry/nextjs";

// DSN público del proyecto (Sentry > Settings > Projects > Client Keys).
// Si no está definido, el SDK queda inerte y la app funciona igual.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,
  // No enviamos datos personales por defecto (la app maneja DNI/selfie).
  dataCollection: {
    userInfo: false,
  },
  tracesSampleRate: Number(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1,
  ),
});
