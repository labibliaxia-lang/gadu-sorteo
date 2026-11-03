import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { processAutoDraws, processManualDrawReminders } from "@/lib/auto-draw";

export const dynamic = "force-dynamic";

/**
 * Ejecuta los sorteos automáticos opt-in cuya hora ya llegó.
 *
 * Pensado para un scheduler por minuto (Vercel Pro, cron-job.org, GitHub
 * Actions o pg_cron + HTTP). Vercel Hobby solo permite cron diario, por eso
 * este endpoint se mantiene separado del cron de reservas y se puede invocar
 * con:
 *
 *   GET /api/cron/auto-draw
 *   Authorization: Bearer $CRON_SECRET
 *
 * También existe el fallback perezoso en la página pública del sorteo.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;

  const authorized =
    !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!authorized) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const [summary, reminders] = await Promise.all([
      processAutoDraws({ source: "cron" }),
      processManualDrawReminders(),
    ]);

    if (summary.drawn > 0) {
      revalidatePath("/ganadores");
      revalidatePath("/admin");
    }

    return NextResponse.json({ ok: true, ...summary, reminders });
  } catch (error) {
    console.error("Cron auto-draw:", error);
    return NextResponse.json(
      { error: "Error interno procesando la solicitud" },
      { status: 500 },
    );
  }
}
