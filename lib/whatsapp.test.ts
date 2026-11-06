import { describe, expect, it } from "vitest";

import { waHref } from "@/lib/whatsapp";

describe("waHref", () => {
  it("antepone 54 a un número local", () => {
    const href = waHref("3547469000", "Ana", [1, 2]);

    expect(href.startsWith("https://wa.me/543547469000?text=")).toBe(true);
    expect(decodeURIComponent(href)).toContain("Ana");
    expect(decodeURIComponent(href)).toContain("2 número(s)");
  });

  it("respeta el 54 si ya viene con código de país", () => {
    expect(waHref("+54 9 354 746 9000", "Ana", [1]).startsWith("https://wa.me/5493547469000")).toBe(
      true,
    );
  });

  it("limpia separadores y no duplica el código", () => {
    expect(waHref("(354) 746-9000", "Ana", []).startsWith("https://wa.me/543547469000")).toBe(
      true,
    );
  });

  it("sin teléfono abre el selector con el texto", () => {
    const href = waHref(null, "Ana", [7]);

    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(href)).toContain("1 número(s)");
  });

  it("si el teléfono no tiene dígitos, no inventa destinatario", () => {
    expect(waHref("sin número", "Ana", [1]).startsWith("https://wa.me/?text=")).toBe(true);
  });
});
