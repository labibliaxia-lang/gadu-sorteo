import type { MetadataRoute } from "next";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const revalidate = 3600;

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_URL?.trim().replace(/\/+$/, "") ??
    "http://localhost:3000"
  );
}

/**
 * Sitemap público: páginas fijas + sorteos + perfiles de organizador.
 * Excluye rutas privadas (panel, perfil, pagos) a propósito.
 *
 * Usa un cliente Supabase anónimo sin cookies para que el sitemap pueda
 * cachearse y no dependa de la sesión.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = baseUrl();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let raffles: { id: string; created_at: string | null }[] = [];
  let organizers: { slug: string | null }[] = [];

  if (url && anonKey) {
    const supabase = createSupabaseClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [rafflesResult, organizersResult] = await Promise.all([
      supabase
        .from("raffles")
        .select("id, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("public_organizers")
        .select("slug")
        .not("slug", "is", null)
        .limit(200),
    ]);

    raffles = rafflesResult.data ?? [];
    organizers = organizersResult.data ?? [];
  }

  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    {
      url: `${base}/ganadores`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${base}/como-funciona`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${base}/planes`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${base}/ayuda`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${base}/terminos`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/privacidad`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const raffleRoutes: MetadataRoute.Sitemap = (raffles ?? []).map((raffle) => ({
    url: `${base}/sorteos/${raffle.id}`,
    lastModified: raffle.created_at ? new Date(raffle.created_at) : now,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const organizerRoutes: MetadataRoute.Sitemap = (organizers ?? []).map(
    (organizer) => ({
      url: `${base}/organizador/${organizer.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    }),
  );

  return [...staticRoutes, ...raffleRoutes, ...organizerRoutes];
}
