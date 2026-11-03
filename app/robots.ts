import type { MetadataRoute } from "next";

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_URL?.trim().replace(/\/+$/, "") ??
    "http://localhost:3000"
  );
}

/** Solo lo público; el panel, la cuenta y las APIs quedan fuera. */
export default function robots(): MetadataRoute.Robots {
  const base = baseUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/api/",
          "/perfil",
          "/mis-numeros",
          "/mis-pagos",
          "/login",
          "/register",
          "/pago/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
