import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
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
