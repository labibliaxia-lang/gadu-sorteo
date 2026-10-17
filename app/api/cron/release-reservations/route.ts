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

  return NextResponse.json({ released: released ?? 0 });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
