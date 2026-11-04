import { describe, expect, it } from "vitest";

import {
  landingContentSchema,
  videoEmbedUrl,
  videoProvider,
} from "@/lib/landing";

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
