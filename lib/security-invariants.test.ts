import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Blindaje de las protecciones que costó encontrar.
 *
 * `migrations.test.ts` cuida que el código y las migraciones no se contradigan
 * (una RPC llamada que no existe, una función de trigger sin su trigger). Esto
 * es el paso siguiente: cuidar el CONTENIDO de las protecciones, para que
 * reescribir una función no borre un freno sin que nadie lo note.
 *
 * Un `create or replace function` posterior gana. Por eso cada comprobación
 * busca la ÚLTIMA definición en el orden de las migraciones, no la primera: si
 * alguien vuelve a pegar el cuerpo viejo de `0001`, este test falla.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const TESTS_DIR = join(ROOT, "supabase", "tests");

function migrationFiles(): { version: string; name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
    .map((f) => ({
      version: f.slice(0, 4),
      name: f,
      sql: readFileSync(join(MIGRATIONS_DIR, f), "utf8"),
    }));
}

const FILES = migrationFiles();
const SQL = FILES.map((f) => f.sql).join("\n");

function file(version: string): string {
  const found = FILES.find((f) => f.version === version);
  if (!found) throw new Error(`falta la migración ${version}`);
  return found.sql;
}

/**
 * Cuerpo de la última definición de una función.
 *
 * Recorta desde el último `create [or replace] function <nombre>` hasta el
 * `$$;` que cierra el cuerpo. Las migraciones de este proyecto usan `$$` fijo.
 */
function lastDefinition(nombre: string): string {
  const marcador = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${nombre}\\s*\\(`,
    "gi",
  );

  let ultimo = -1;
  for (const coincidencia of SQL.matchAll(marcador)) {
    ultimo = coincidencia.index ?? -1;
  }

  expect(ultimo, `${nombre} no está definida en ninguna migración`).toBeGreaterThan(-1);

  const fin = SQL.indexOf("$$;", ultimo);
  return fin === -1 ? SQL.slice(ultimo) : SQL.slice(ultimo, fin + 3);
}

describe("blindaje: reserva y dinero", () => {
  it("reserve_numbers no devuelve reservas viejas (hallazgo #2)", () => {
    const cuerpo = lastDefinition("reserve_numbers");

    // El patrón que mata el doble cobro: CTE + returning de lo reservado ahora.
    expect(cuerpo).toMatch(/with\s+nuevos\s+as\s*\(/i);
    expect(cuerpo).toMatch(/returning\s+number/i);
    // Y las reservas propias vencidas se sueltan antes de reservar.
    expect(cuerpo).toMatch(/reserved_until\s*<\s*now\(\)/i);
  });

  it("reserve_numbers valida suspendidos y tope por hora (hallazgo #12)", () => {
    const cuerpo = lastDefinition("reserve_numbers");

    expect(cuerpo).toMatch(/is_banned/i);
    expect(cuerpo).toMatch(/check_rate_limit/i);
    expect(cuerpo).toMatch(/100/);
  });

  it("release_expired_reservations respeta un pago en curso (hallazgo #3)", () => {
    const cuerpo = lastDefinition("release_expired_reservations");

    expect(cuerpo).toMatch(/p\.status\s*=\s*'pending'/i);
    expect(cuerpo).toMatch(/24 hours/i);
    expect(cuerpo).toMatch(/not\s+exists/i);
  });

  it("sell_numbers no vende con el sorteo sorteado (hallazgo #6)", () => {
    const cuerpo = lastDefinition("sell_numbers");

    expect(cuerpo).toMatch(/status\s*<>\s*'drawn'/i);
    expect(cuerpo).toMatch(/for\s+update/i);
  });

  it("organizer_mark_sold rechaza un sorteo sorteado (hallazgo #6)", () => {
    const cuerpo = lastDefinition("organizer_mark_sold");

    expect(cuerpo).toMatch(/v_status\s*=\s*'drawn'/i);
    expect(cuerpo).toMatch(/ya fue sorteado/i);
  });

  it("organizer_mark_reserved_sold rechaza confirmar pagos tras sortear (0074)", () => {
    // 0071 cerró este agujero para `sell_numbers` y `organizer_mark_sold`, pero
    // no para el prepago manual, que es el camino que se usa hoy. Confirmar un
    // pago después del sorteo cambia el listado vendido, rompe `numbers_hash` y
    // hace que el verificador acuse fraude en un sorteo limpio.
    const cuerpo = lastDefinition("organizer_mark_reserved_sold");

    expect(cuerpo).toMatch(/v_status\s*=\s*'drawn'/i);
    expect(cuerpo).toMatch(/ya fue sorteado/i);
    // Y sigue siendo todo o nada: sin esto, una venta parcial quedaría sin
    // comprador.
    expect(cuerpo).toMatch(/v_count\s*<>\s*v_expected/i);
  });

  it("void_sold_numbers solo con el sorteo en venta (hallazgo #8)", () => {
    const cuerpo = lastDefinition("void_sold_numbers");

    expect(cuerpo).toMatch(/<>\s*'active'/i);
    // Nunca libera un número de otro pago ni de otro usuario.
    expect(cuerpo).toMatch(/sold_to\s*=\s*p_user_id/i);
    expect(cuerpo).toMatch(/payment_id\s*=\s*p_payment_id/i);
    // Y no la puede llamar el navegador.
    expect(file("0070")).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.void_sold_numbers[\s\S]*?authenticated/i,
    );
  });
});

describe("blindaje: resultado del sorteo", () => {
  it("el resultado solo lo escribe el motor (hallazgo #1)", () => {
    const cuerpo = lastDefinition("guard_raffle_result");

    expect(cuerpo).toMatch(/current_user\s+not\s+in\s*\(/i);
    expect(cuerpo).toMatch(/winner_number/i);
    expect(cuerpo).toMatch(/result_hash/i);
    expect(cuerpo).toMatch(/draw_commitment/i);
  });

  it("el alta de perfil no elige el rol (hallazgo #4)", () => {
    const cuerpo = lastDefinition("force_profile_role_on_insert");

    // Regla del proyecto: se mira la sesión, no el rol de conexión.
    expect(cuerpo).toMatch(/auth\.uid\(\)\s+is\s+not\s+null/i);
    expect(cuerpo).toMatch(/new\.role\s*:=\s*'user'/i);
  });

  it("la fecha del sorteo no se adelanta bajando draw_date (hallazgo #5)", () => {
    const cuerpo = lastDefinition("enforce_draw_date");

    expect(cuerpo).toMatch(/old\.draw_date/i);
    expect(cuerpo).toMatch(/new\.draw_date/i);
  });

  it("la fecha no se mueve con el sorteo en venta: la cuenta regresiva es una promesa", () => {
    const cuerpo = lastDefinition("lock_draw_date_when_live");

    expect(cuerpo).toMatch(/new\.draw_date\s+is\s+distinct\s+from\s+old\.draw_date/i);
    expect(cuerpo).toMatch(/old\.status\s*=\s*'active'/i);
    // Superadmin y procesos del motor quedan exceptuados.
    expect(cuerpo).toMatch(/is_superadmin\(\)/i);
    expect(cuerpo).toMatch(/service_role/i);
  });

  it("payments admite los estados de devolución (hallazgo #8)", () => {
    expect(file("0070")).toMatch(/'refunded'\s*,\s*'charged_back'/);
  });

  it("nadie inserta números por PostgREST (hallazgo #14)", () => {
    // Insertar filas 'sold' falsas cambia el conjunto con el que se sortea.
    expect(file("0072")).toMatch(
      /revoke\s+insert\s+on\s+public\.raffle_numbers\s+from\s+authenticated/i,
    );
    expect(file("0072")).toMatch(
      /drop\s+policy\s+if\s+exists\s+"raffle_numbers_insert_owner"/i,
    );
  });

  it("el organizador ve el contacto del comprador, no su perfil (hallazgo #15)", () => {
    const sql = file("0073");
    const vista =
      /create or replace view public\.raffle_buyers[\s\S]*?\);\s*\n/i.exec(sql)?.[0] ??
      "";

    // La vista corre con privilegios del dueño: el WHERE es la única barrera.
    expect(vista).toMatch(/security_invoker\s*=\s*false/i);
    expect(vista).toMatch(/r\.created_by\s*=\s*auth\.uid\(\)/i);
    expect(vista).toMatch(/is_superadmin\(\)/i);

    // Y expone nombre y teléfono, nada más.
    expect(vista).toMatch(/buyer\.full_name/i);
    expect(vista).toMatch(/buyer\.phone/i);
    expect(vista).not.toMatch(/email|dni_number|address_line|city|province/i);

    expect(sql).toMatch(
      /drop policy if exists "profiles_select_own_raffle_buyers"/i,
    );
  });
});

describe("blindaje: código que acompaña a las migraciones", () => {
  const webhook = readFileSync(
    join(ROOT, "app", "api", "webhooks", "mercadopago", "route.ts"),
    "utf8",
  );
  const checkout = readFileSync(
    join(ROOT, "app", "api", "checkout", "route.ts"),
    "utf8",
  );

  it("el webhook compara lo vendido con lo cobrado (hallazgo #3)", () => {
    expect(webhook).toMatch(/delivered\s*!==\s*expected/);
    expect(webhook).toMatch(/esperados/);
  });

  it("el webhook procesa devoluciones de un pago aprobado (hallazgo #8)", () => {
    expect(webhook).toMatch(/isReversalStatus/);
    expect(webhook).toMatch(/void_sold_numbers/);
    // La excepción al guard de idempotencia.
    expect(webhook).toMatch(/payment\.status\s*===\s*"approved"\s*&&\s*isReversal/);
  });

  it("el webhook concilia importe y moneda antes de entregar (hallazgo #9)", () => {
    expect(webhook).toMatch(/amountMatches/);
    expect(webhook).toMatch(/currencyMismatch/);
    expect(webhook).toMatch(/amount_mismatch/);
  });

  it("el checkout reutiliza el pago del mismo carrito (hallazgo #2)", () => {
    expect(checkout).toMatch(/sameNumberSet/);
    expect(checkout).toMatch(/reusedPaymentId/);
    // Y no deja reservas huérfanas al responder 409 (hallazgo #11).
    expect(checkout).toMatch(/release_numbers/);
  });
});

describe("blindaje: los verificadores de SQL", () => {
  it("todo verificador que abre transacción la cierra con rollback, nunca con commit", () => {
    const scripts = readdirSync(TESTS_DIR).filter((f) => /^verificar_.*\.sql$/.test(f));

    // Sin esto el test pasaría por vacío si el lector no encontrara archivos.
    expect(scripts.length).toBeGreaterThan(2);

    for (const script of scripts) {
      const sql = readFileSync(join(TESTS_DIR, script), "utf8");

      // Ningún verificador puede dejar cambios, ni siquiera por descuido.
      expect(sql.toLowerCase(), `${script} no debe confirmar`).not.toMatch(
        /^\s*commit;/m,
      );

      const abreTransaccion = /^\s*begin;/m.test(sql);
      if (!abreTransaccion) continue; // p. ej. verificar_esquema.sql: solo catálogos

      const lineas = sql
        .split(/\r?\n/)
        .map((l) => l.trim().toLowerCase())
        .filter((l) => l.length > 0 && !l.startsWith("--"));

      expect(
        lineas[lineas.length - 1],
        `${script} abre transacción y debe terminar en rollback;`,
      ).toBe("rollback;");
    }
  });
});
