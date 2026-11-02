import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Libera reservas expiradas. Lo invoca Vercel Cron cada 5 minutos.
 * Protegido con CRON_SECRET (Vercel envía el header Authorization).
 */
async function handle(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const querySecret = request.nextUrl.searchParams.get("secret") ?? "";
  const cronSecret = process.env.CRON_SECRET;

  const authorized =
    !!cronSecret &&
    (authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret);

  if (!authorized) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: released, error } = await admin.rpc(
    "release_expired_reservations",
  );

  if (error) {
    console.error("Cron: error liberando reservas", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mantenimiento de planes: aplica la baja por vencimiento (0032) con los
  // 3 días de gracia ya incluidos en la función.
  const { data: expiredPlans, error: expiryError } = await admin.rpc(
    "expire_plans",
  );

  if (expiryError) {
    console.error("Cron: error aplicando vencimientos de plan", expiryError);
  }

  return NextResponse.json({
    released: released ?? 0,
    plans: expiredPlans ?? null,
    plansOk: !expiryError,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
