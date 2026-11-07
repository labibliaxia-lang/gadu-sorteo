import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MONEDAS = ["ARS", "MXN", "COP", "CLP"] as const;
type Moneda = (typeof MONEDAS)[number];

const FUENTE = "https://open.er-api.com/v6/latest/USD";

function autorizado(request: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secreto}`;
}

/**
 * Actualiza las cotizaciones LATAM y recalcula los precios locales de los
 * planes a partir de `price_usd`.
 *
 * Si la API externa falla, NO rompe nada: deja los últimos valores guardados
 * en `exchange_rates` y responde 200 con `stale: true`.
 */
export async function GET(request: Request) {
  return actualizar(request);
}

export async function POST(request: Request) {
  return actualizar(request);
}

async function actualizar(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();

  let rates: Record<string, number> = {};

  try {
    const respuesta = await fetch(FUENTE, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!respuesta.ok) {
      throw new Error(`API de cotizaciones respondió ${respuesta.status}`);
    }
    const json = (await respuesta.json()) as { rates?: Record<string, unknown> };
    const tabla = json.rates ?? {};
    for (const moneda of MONEDAS) {
      const valor = Number(tabla[moneda]);
      if (Number.isFinite(valor) && valor > 0) rates[moneda] = valor;
    }
    if (Object.keys(rates).length === 0) {
      throw new Error("La API no devolvió cotizaciones utilizables");
    }
  } catch (error) {
    // Último valor guardado: la página sigue funcionando con eso.
    const { data } = await admin
      .from("exchange_rates")
      .select("currency_code, rate_to_usd, updated_at")
      .in("currency_code", [...MONEDAS]);

    return NextResponse.json(
      {
        ok: false,
        stale: true,
        error: error instanceof Error ? error.message : "Error desconocido",
        rates: data ?? [],
      },
      { status: 200 },
    );
  }

  const ahora = new Date().toISOString();

  for (const moneda of MONEDAS) {
    if (!rates[moneda]) continue;
    const { error } = await admin.from("exchange_rates").upsert(
      {
        currency_code: moneda,
        rate_to_usd: rates[moneda],
        updated_at: ahora,
      },
      { onConflict: "currency_code" },
    );
    if (error) {
      console.error(`[update-rates] no se pudo guardar ${moneda}:`, error.message);
    }
  }

  const { data: planes, error: planesError } = await admin
    .from("plan_configs")
    .select("plan_name, price_usd");

  if (planesError) {
    return NextResponse.json(
      { ok: false, error: planesError.message },
      { status: 500 },
    );
  }

  let actualizados = 0;

  for (const plan of planes ?? []) {
    const usd = Number(plan.price_usd);
    if (!(usd > 0)) continue;

    const { error } = await admin
      .from("plan_configs")
      .update({
        price_ars: Math.round(usd * (rates.ARS ?? 0) * 100) / 100,
        price_mxn: Math.round(usd * (rates.MXN ?? 0) * 100) / 100,
        price_cop: Math.round(usd * (rates.COP ?? 0) * 100) / 100,
        price_clp: Math.round(usd * (rates.CLP ?? 0) * 100) / 100,
        updated_at: ahora,
      })
      .eq("plan_name", plan.plan_name);

    if (error) {
      console.error(`[update-rates] plan ${plan.plan_name}:`, error.message);
    } else {
      actualizados += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    source: FUENTE,
    updated_at: ahora,
    rates,
    planes_actualizados: actualizados,
  });
}
