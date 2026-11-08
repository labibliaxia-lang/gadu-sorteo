const { withSentryConfig } = require("@sentry/nextjs/config");
const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Necesario en Next 14 para que se cargue instrumentation.ts (Sentry).
    instrumentationHook: true,
  },
  images: {
    // Mitigación de los CVEs del optimizador de Next 14 (SVG/AVIF RCE).
    // No procesamos imágenes subidas por usuarios con el optimizador.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        // Avatares de Google (inicio de sesión con Google).
        protocol: "https",
        hostname: "**.googleusercontent.com",
      },
    ],
  },
};

// Sentry: instrumenta el build y sube source maps SOLO si están las tres
// variables (token + org + proyecto). Sin ellas el build sigue funcionando
// igual y el SDK queda inerte.
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const canUploadSourcemaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN && sentryOrg && sentryProject,
);

module.exports = withSentryConfig(withNextIntl(nextConfig), {
  org: sentryOrg || "gadu-sorteos",
  project: sentryProject || "gadu-sorteos",
  silent: true,
  widenClientFileUpload: false,
  sourcemaps: {
    disable: !canUploadSourcemaps,
  },
});
