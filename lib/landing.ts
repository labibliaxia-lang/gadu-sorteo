import { z } from "zod";

/**
 * Bloques de la landing promocional de un sorteo.
 *
 * Reglas de seguridad:
 * - El texto se renderiza como texto React, nunca como HTML.
 * - Las imágenes deben venir del bucket público de portadas de Gadu.
 * - El video solo acepta un ID válido de YouTube; no se guarda HTML/iframe.
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
    .refine((value) => youtubeId(value) !== null, {
      message: "Pegá un enlace válido de YouTube",
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

/** Extrae el ID de 11 caracteres de un link de YouTube (watch, youtu.be, embed). */
export function youtubeId(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  const patterns = [
    /(?:youtube\.com\/watch\?[^#]*\bv=)([A-Za-z0-9_-]{11})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

export function youtubeEmbedUrl(value: string): string | null {
  const id = youtubeId(value);
  return id ? `https://www.youtube.com/embed/${id}` : null;
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

  return url.startsWith(
    `${base}/storage/v1/object/public/raffle-images/`,
  );
}

/** Parsea el JSON de la base sin romper la página si una fila vieja es inválida. */
export function parseLandingContent(value: unknown): LandingBlock[] {
  const result = landingContentSchema.safeParse(value);
  return result.success ? result.data : [];
}
