import { describe, expect, it } from "vitest";

import en from "../messages/en.json";
import es from "../messages/es.json";
import pt from "../messages/pt.json";
import { routing } from "../src/i18n/routing";

type Messages = Record<string, unknown>;

function flattenKeys(value: Messages, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === "object" && !Array.isArray(child)) {
      return flattenKeys(child as Messages, path);
    }
    return [path];
  });
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([a-zA-Z0-9_]+)/g)]
    .map((match) => match[1])
    .sort();
}

function richTags(value: string): string[] {
  return [...value.matchAll(/<([a-z][a-z0-9]*)>/g)]
    .map((match) => match[1])
    .sort();
}

function valuesByKey(value: Messages, prefix = ""): Record<string, string> {
  return Object.entries(value).reduce<Record<string, string>>(
    (acc, [key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (child !== null && typeof child === "object" && !Array.isArray(child)) {
        Object.assign(acc, valuesByKey(child as Messages, path));
      } else {
        acc[path] = String(child);
      }
      return acc;
    },
    {},
  );
}

describe("i18n routing", () => {
  it("usa español sin prefijo y en/pt con prefijo", () => {
    expect(routing.locales).toEqual(["es", "en", "pt"]);
    expect(routing.defaultLocale).toBe("es");
    expect(routing.localePrefix).toBe("as-needed");
    expect(routing.localeDetection).toBe(false);
  });
});

describe("catálogos de mensajes", () => {
  it("tienen exactamente las mismas claves en es, en y pt", () => {
    const esKeys = flattenKeys(es as Messages).sort();
    expect(flattenKeys(en as Messages).sort()).toEqual(esKeys);
    expect(flattenKeys(pt as Messages).sort()).toEqual(esKeys);
  });

  it("conservan placeholders y etiquetas de texto enriquecido", () => {
    const esValues = valuesByKey(es as Messages);
    for (const catalog of [en as Messages, pt as Messages]) {
      const values = valuesByKey(catalog);
      for (const [key, original] of Object.entries(esValues)) {
        expect(placeholders(values[key]), `placeholders de ${key}`).toEqual(
          placeholders(original),
        );
        expect(richTags(values[key]), `tags de ${key}`).toEqual(
          richTags(original),
        );
      }
    }
  });
});
