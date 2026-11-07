import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Guardarraíles del proyecto: invariantes de seguridad que no deben
 * desaparecer en una refactorización.
 *
 * Lee las migraciones y el código tal como están en el repo. No toca la base:
 * si alguien reescribe una RPC y borra un freno, este test falla en CI.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

const SQL = readdirSync(MIGRATIONS_DIR)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
  .join("\n");

const WEBHOOK = readFileSync(
  join(ROOT, "app", "api", "webhooks", "mercadopago", "route.ts"),
  "utf8",
);

const CI = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");

describe("reservas: no se reserva dos veces el mismo número", () => {
  it("las RPC de reserva solo toman números disponibles", () => {
    // El UPDATE de reserva filtra status = 'available'; sin ese filtro el
    // mismo número podría quedar reservado por dos compradores.
    expect(SQL).toMatch(
      /update public\.raffle_numbers[\s\S]{0,200}status = 'reserved'[\s\S]{0,200}and status = 'available'/,
    );
  });

  it("las RPC exigen que el sorteo esté activo", () => {
    expect(SQL).toMatch(/where id = p_raffle_id and status = 'active'/);
  });
});

describe("webhook de Mercado Pago", () => {
  it("verifica la firma antes de procesar", () => {
    expect(WEBHOOK).toContain("verifyWebhookSignature");
    expect(WEBHOOK).toMatch(/status:\s*401/);
  });

  it("la verificación ocurre antes de tocar payments", () => {
    const firma = WEBHOOK.indexOf("verifyWebhookSignature");
    const update = WEBHOOK.indexOf('from("payments")');
    expect(firma).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(firma === -1 ? 0 : firma - 1);
  });
});

describe("roles: un usuario no puede hacer acciones de admin", () => {
  it("la RLS de raffles exige is_admin y dueño para insertar", () => {
    expect(SQL).toMatch(/with check \(public\.is_admin\(\) and created_by = auth\.uid\(\)\)/);
  });

  it("las acciones sensibles verifican superadmin", () => {
    expect(SQL).toMatch(/create or replace function public\.is_superadmin\(/);
  });
});

describe("bases legales", () => {
  it("existe el candado que impide publicar sin aceptarlas", () => {
    expect(SQL).toContain("enforce_terms_on_publish");
    expect(SQL).toMatch(/terms_accepted_by_organizer/);
  });

  it("el candado se aplica al insertar y al activar", () => {
    expect(SQL).toMatch(
      /before insert or update of status, terms_accepted_by_organizer/,
    );
  });
});

describe("CI", () => {
  it("corre los cuatro gates en cada push a main", () => {
    expect(CI).toContain("npm run typecheck");
    expect(CI).toContain("npm run lint");
    expect(CI).toContain("npm test");
    expect(CI).toContain("npm run build");
    expect(CI).toMatch(/push:\s*\n\s*branches:\s*\[main\]/);
  });
});
