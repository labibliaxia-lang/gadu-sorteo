import { NextRequest, NextResponse } from "next/server";

import { processAutoDraws, processManualDrawReminders } from "@/lib/auto-draw";
import { evaluarCronAuth } from "@/lib/cron-auth";
import { sendPlanReminderEmails } from "@/lib/plan-reminders";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Libera reservas expiradas. Lo invoca Vercel Cron cada 5 minutos
 * (`vercel.json`), protegido con CRON_SECRET.
 *
 * Si falta `CRON_SECRET` responde **500**, no 401: mientras la variable no esté,
 * este cron no libera nada, y un 401 haría parecer que alguien está golpeando la
 * puerta en vez de que falta configuración.
 */
async function handle(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";

  const auth = evaluarCronAuth(process.env.CRON_SECRET, authHeader);

  if (!auth.ok) {
    if (auth.status === 500) {
      console.error(`Cron: ${auth.detalle}`);
    }
    return NextResponse.json(
      { error: auth.error, detalle: auth.detalle },
      { status: auth.status },
    );
  }

  const admin = createAdminClient();
  const { data: released, error } = await admin.rpc(
    "release_expired_reservations",
  );

  if (error) {
    console.error("Cron: error liberando reservas", error);
    return NextResponse.json(
      { error: "Error interno procesando la solicitud" },
      { status: 500 },
    );
  }

  // Mantenimiento de planes: aplica la baja por vencimiento (0032) con los
  // 3 días de gracia ya incluidos en la función.
  const { data: expiredPlans, error: expiryError } = await admin.rpc(
    "expire_plans",
  );

  if (expiryError) {
    console.error("Cron: error aplicando vencimientos de plan", expiryError);
  }

  // Recordatorios 7/3/1 días antes del vencimiento (0039).
  let reminders: { sent: number; skipped: number; failed: number } | null = null;
  try {
    reminders = await sendPlanReminderEmails();
  } catch (error) {
    console.error("Cron: error enviando recordatorios de plan", error);
  }

  // Limpieza de ventanas viejas de rate limiting (0040).
  const { error: cleanupError } = await admin
    .from("rate_limits")
    .delete()
    .lt(
      "window_start",
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    );

  if (cleanupError) {
    console.error("Cron: error limpiando rate limits", cleanupError);
  }

  // Red de seguridad diaria para sorteos automáticos cuya hora ya pasó.
  // El endpoint /api/cron/auto-draw (o el fallback al abrir el sorteo) es el
  // que corre con granularidad de minutos.
  let autoDraw: Awaited<ReturnType<typeof processAutoDraws>> | null = null;
  let manualDrawReminders: Awaited<
    ReturnType<typeof processManualDrawReminders>
  > | null = null;
  try {
    autoDraw = await processAutoDraws({ source: "cron" });
    manualDrawReminders = await processManualDrawReminders();
  } catch (error) {
    console.error("Cron: error ejecutando sorteos automáticos", error);
  }

  return NextResponse.json({
    released: released ?? 0,
    plans: expiredPlans ?? null,
    plansOk: !expiryError,
    reminders,
    rateLimitCleanup: !cleanupError,
    autoDraw,
    manualDrawReminders,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
