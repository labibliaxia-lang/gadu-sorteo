import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

/**
 * Regresión de hidratación de la sala en vivo (/sorteos/[slug]/en-vivo).
 *
 * El CSS de la ceremonia se renderiza dentro de un `<style>`. Si el CSS va como
 * hijo de texto, React lo escapa en el servidor (`content: &quot;&quot;`) y el
 * primer render del cliente lo compara crudo (`content: ""`): React #425
 * "Text content did not match" y se cae la hidratación de todo el árbol
 * ("the entire root will switch to client rendering"). Tiene que ir como HTML
 * crudo con `dangerouslySetInnerHTML`.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPONENT = readFileSync(
  join(ROOT, "components", "LiveDrawAnimation.tsx"),
  "utf8",
);

/** La forma correcta: el CSS se inyecta sin que React escape su contenido. */
const INYECCION_CRUDA =
  /<style\s+dangerouslySetInnerHTML=\{\{\s*__html:\s*CEREMONIA_CSS\s*\}\}\s*\/>/;

/** La forma que rompió producción: el CSS como hijo de texto de `<style>`. */
const CSS_COMO_TEXTO = /<style>\s*\{CEREMONIA_CSS\}/;

describe("hidratación de la sala en vivo", () => {
  it("el CSS de la ceremonia va como HTML crudo, no como texto", () => {
    expect(COMPONENT).toMatch(INYECCION_CRUDA);
    expect(COMPONENT).not.toMatch(CSS_COMO_TEXTO);
  });

  it("pasar el mismo CSS como texto cambia el HTML del servidor (justifica el guard)", () => {
    const css = '.ejemplo { content: ""; }';

    const comoTexto = renderToStaticMarkup(createElement("style", null, css));
    const comoHtml = renderToStaticMarkup(
      createElement("style", {
        dangerouslySetInnerHTML: { __html: css },
      }),
    );

    // React escapa las comillas del texto; el navegador no las decodifica
    // dentro de <style>, así que el cliente renderiza un texto distinto.
    expect(comoTexto).toContain("&quot;");
    expect(comoTexto).not.toContain('content: "";');

    // Con HTML crudo el servidor y el cliente coinciden exactamente.
    expect(comoHtml).toContain('content: "";');
    expect(comoHtml).not.toContain("&quot;");
  });
});
