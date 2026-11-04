import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isAllowedLandingImage,
  landingContentSchema,
  videoEmbedUrl,
  videoProvider,
} from "@/lib/landing";

const SUPABASE = "https://demo.supabase.co";
const BUCKET = `${SUPABASE}/storage/v1/object/public/raffle-images/`;

describe("isAllowedLandingImage", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("acepta una imagen del bucket raffle-images", () => {
    expect(isAllowedLandingImage(`${BUCKET}portada.jpg`)).toBe(true);
  });

  it("rechaza otro bucket del mismo proyecto", () => {
    expect(
      isAllowedLandingImage(
        `${SUPABASE}/storage/v1/object/public/avatars/foto.jpg`,
      ),
    ).toBe(false);
  });

  it("rechaza path traversal hacia otro bucket", () => {
    expect(
      isAllowedLandingImage(
        `${BUCKET}../avatars/foto.jpg`,
      ),
    ).toBe(false);
    expect(
      isAllowedLandingImage(
        `${BUCKET}%2e%2e/avatars/foto.jpg`,
      ),
    ).toBe(false);
  });

  it("rechaza otro host y HTTP", () => {
    expect(
      isAllowedLandingImage(
        "https://evil.com/storage/v1/object/public/raffle-images/foto.jpg",
      ),
    ).toBe(false);
    expect(
      isAllowedLandingImage(
        "http://demo.supabase.co/storage/v1/object/public/raffle-images/foto.jpg",
      ),
    ).toBe(false);
  });
});

describe("videoProvider", () => {
  it("acepta YouTube watch, youtu.be, shorts y embed", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    ]) {
      expect(videoProvider(url)).toEqual({
        provider: "youtube",
        id: "dQw4w9WgXcQ",
      });
    }
  });

  it("acepta Vimeo y player.vimeo.com", () => {
    for (const url of [
      "https://vimeo.com/123456789",
      "https://www.vimeo.com/123456789/abc123",
      "https://player.vimeo.com/video/123456789",
    ]) {
      expect(videoProvider(url)).toEqual({
        provider: "vimeo",
        id: "123456789",
      });
    }
  });

  it("rechaza hosts, protocolos y IDs inválidos", () => {
    for (const url of [
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://evil.com/youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/corto",
      "https://vimeo.com/abc",
      "javascript:alert(1)",
    ]) {
      expect(videoProvider(url)).toBeNull();
    }
  });
});

describe("videoEmbedUrl", () => {
  it("genera el embed de YouTube sin usar la URL cruda", () => {
    expect(
      videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  it("genera el embed de Vimeo", () => {
    expect(videoEmbedUrl("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
  });

  it("devuelve null para un host no permitido", () => {
    expect(videoEmbedUrl("https://evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});

describe("landingContentSchema", () => {
  it("acepta un bloque de video de Vimeo", () => {
    const result = landingContentSchema.safeParse([
      { id: "b1", type: "video", url: "https://vimeo.com/123456789" },
    ]);
    expect(result.success).toBe(true);
  });

  it("rechaza HTML crudo y URLs de video no permitidas", () => {
    const result = landingContentSchema.safeParse([
      { id: "b1", type: "video", url: "https://evil.com/video.mp4" },
    ]);
    expect(result.success).toBe(false);
  });
});
