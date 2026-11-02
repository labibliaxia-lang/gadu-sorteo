const { withSentryConfig } = require("@sentry/nextjs/config");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Necesario en Next 14 para que se cargue instrumentation.ts (Sentry).
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
};

// Sentry: instrumenta el build y sube source maps si hay SENTRY_AUTH_TOKEN.
// Sin token (o sin DSN) todo queda inerte y el build sigue funcionando.
module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || "gadu-sorteos",
  project: process.env.SENTRY_PROJECT || "gadu-sorteos",
  silent: true,
  widenClientFileUpload: false,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
