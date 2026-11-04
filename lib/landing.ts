import { z } from "zod";

/**
 * Bloques de la landing promocional de un sorteo.
 *
 * Reglas de seguridad:
 * - El texto se renderiza como texto React, nunca como HTML.
 * - Las imágenes deben venir del bucket público de portadas de Gadu.
 * - El video solo acepta YouTube o Vimeo; se guarda la URL original y se
 *   genera el embed a partir de un ID validado. Nunca se guarda HTML/iframe.
 */

const TEXT_MAX = 1200;
const TITLE_MAX = 140;

export const textBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("text"),
  title: z.string().trim().max(TITLE_MAX).optional().default(""),
  body: z.string().trim().min(1, "Escribí el párrafo").max(TEXT_MAX),
});

export const imageBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("image"),
  url: z.string().url("La imagen no tiene una URL válida"),
  alt: z.string().trim().max(160).optional().default(""),
  caption: z.string().trim().max(200).optional().default(""),
});

export const videoBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("video"),
  url: z
    .string()
    .trim()
    .refine((value) => videoProvider(value) !== null, {
      message: "Pegá un enlace válido de YouTube o Vimeo",
    }),
});

export const landingBlockSchema = z.discriminatedUnion("type", [
  textBlockSchema,
  imageBlockSchema,
  videoBlockSchema,
]);

export const landingContentSchema = z.array(landingBlockSchema).max(20);

export type LandingBlock = z.infer<typeof landingBlockSchema>;
export type TextBlock = z.infer<typeof textBlockSchema>;
export type ImageBlock = z.infer<typeof imageBlockSchema>;
export type VideoBlock = z.infer<typeof videoBlockSchema>;

export type VideoProvider = "youtube" | "vimeo";

export interface VideoRef {
  provider: VideoProvider;
  id: string;
}

/**
 * Parsea un link de YouTube o Vimeo y devuelve proveedor + ID.
 * Se exige HTTPS y un host exacto: nada de `youtube.com@evil.com` ni rutas
 * arbitrarias que después terminen dentro de un iframe.
 */
export function videoProvider(value: string): VideoRef | null {
  const raw = value.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "");

  if (host === "youtu.be") {
    const id = path.split("/").filter(Boolean)[0];
    return id && /^[A-Za-z0-9_-]{11}$/.test(id)
      ? { provider: "youtube", id }
      : null;
  }

  if (host === "youtube.com" || host === "m.youtube.com") {
    if (path === "/watch") {
      const id = url.searchParams.get("v");
      return id && /^[A-Za-z0-9_-]{11}$/.test(id)
        ? { provider: "youtube", id }
        : null;
    }

    const match = path.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})$/);
    return match ? { provider: "youtube", id: match[1] } : null;
  }

  if (host === "vimeo.com") {
    const id = path.split("/").filter(Boolean)[0];
    return id && /^\d{6,12}$/.test(id)
      ? { provider: "vimeo", id }
      : null;
  }

  if (host === "player.vimeo.com") {
    const match = path.match(/^\/video\/(\d{6,12})$/);
    return match ? { provider: "vimeo", id: match[1] } : null;
  }

  return null;
}

/** Compatibilidad con los bloques y la UI existentes. */
export function youtubeId(value: string): string | null {
  const ref = videoProvider(value);
  return ref?.provider === "youtube" ? ref.id : null;
}

/** URL de embed generada por nosotros; nunca se usa la URL cruda en el iframe. */
export function videoEmbedUrl(value: string): string | null {
  const ref = videoProvider(value);
  if (!ref) return null;
  if (ref.provider === "youtube") {
    return `https://www.youtube.com/embed/${ref.id}`;
  }
  return `https://player.vimeo.com/video/${ref.id}`;
}

/** Compatibilidad: solo YouTube. */
export function youtubeEmbedUrl(value: string): string | null {
  return youtubeId(value) ? videoEmbedUrl(value) : null;
}

/**
 * Solo acepta imágenes del bucket público `raffle-images` del proyecto.
 * Se valida en el servidor porque el cliente puede enviar cualquier URL.
 */
export function isAllowedLandingImage(url: string): boolean {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (!base) return false;

  return url.startsWith(`${base}/storage/v1/object/public/raffle-images/`);
}

/** Parsea el JSON de la base sin romper la página si una fila vieja es inválida. */
export function parseLandingContent(value: unknown): LandingBlock[] {
  const result = landingContentSchema.safeParse(value);
  return result.success ? result.data : [];
}
