import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendAutoDrawFailedEmail,
  sendManualDrawReadyEmail,
  sendWinnerEmail,
} from "@/lib/email";

export type AutoDrawSource = "cron" | "lazy" | "manual";

export interface AutoDrawSummary {
  checked: number;
  drawn: number;
  skipped: number;
  errors: number;
}

interface AutoDrawRaffle {
  id: string;
  title: string;
  status: string;
  draw_date: string;
  draw_commitment: string | null;
  created_by: string | null;
}

function drawErrorMessage(error: { message?: string } | null): string {
  return error?.message ?? "Error desconocido";
}

async function logRun(
  admin: ReturnType<typeof createAdminClient>,
  raffleId: string,
  source: AutoDrawSource,
  status: "success" | "skipped" | "error",
  message: string | null,
  winningNumber: number | null = null,
): Promise<void> {
  try {
    await admin.from("auto_draw_runs").insert({
      raffle_id: raffleId,
      source,
      status,
      message,
      winning_number: winningNumber,
    });
  } catch (error) {
    console.error("[auto-draw] no se pudo registrar el intento:", error);
  }
}

async function notifyWinner(
  admin: ReturnType<typeof createAdminClient>,
  raffleId: string,
  winnerUserId: string | null,
  winningNumber: number,
  title: string,
): Promise<void> {
  try {
    if (!winnerUserId) return;

    const { data: profile } = await admin
      .from("profiles")
      .select("email, email_opt_in, terms_accepted_at")
      .eq("id", winnerUserId)
      .maybeSingle();

    if (profile?.email && profile.email_opt_in && profile.terms_accepted_at) {
      await sendWinnerEmail({
        to: profile.email as string,
        raffleTitle: title,
        raffleId,
        winnerNumber: winningNumber,
      });
    }
  } catch (error) {
    console.error("[auto-draw] email al ganador:", error);
  }
}

async function notifyOrganizerFailure(
  admin: ReturnType<typeof createAdminClient>,
  raffle: AutoDrawRaffle,
  reason: string,
): Promise<void> {
  try {
    if (!raffle.created_by) return;

    const { data: profile } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("id", raffle.created_by)
      .maybeSingle();

    if (profile?.email) {
      await sendAutoDrawFailedEmail({
        to: profile.email as string,
        organizerName: (profile.full_name as string | null) ?? null,
        raffleTitle: raffle.title,
        raffleId: raffle.id,
        reason,
      });
    }
  } catch (error) {
    console.error("[auto-draw] email al organizador:", error);
  }
}

async function wasRecentlyNotified(
  admin: ReturnType<typeof createAdminClient>,
  raffleId: string,
  reason: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("auto_draw_runs")
    .select("id")
    .eq("raffle_id", raffleId)
    .in("status", ["skipped", "error"])
    .eq("message", reason)
    .gte("created_at", since)
    .limit(1);

  return (data ?? []).length > 0;
}

async function handleFailure(
  admin: ReturnType<typeof createAdminClient>,
  raffle: AutoDrawRaffle,
  source: AutoDrawSource,
  reason: string,
): Promise<void> {
  // Evita loguear y mandar el mismo aviso cada minuto mientras el problema
  // persiste (por ejemplo, falta de compromiso o cero ventas).
  if (await wasRecentlyNotified(admin, raffle.id, reason)) return;

  await logRun(admin, raffle.id, source, "skipped", reason);
  await notifyOrganizerFailure(admin, raffle, reason);
}

/**
 * Ejecuta los sorteos opt-in cuya fecha ya llegó.
 *
 * - Solo corre en servidor con service role.
 * - Cierra ventas antes de sortear y delega el algoritmo en
 *   `draw_winner_system` (núcleo compartido con el sorteo manual).
 * - Registra cada intento en `auto_draw_runs`; si falla, avisa al organizador.
 * - Es idempotente: un sorteo ya `drawn` se saltea.
 */
export async function processAutoDraws(options?: {
  raffleId?: string;
  source?: AutoDrawSource;
}): Promise<AutoDrawSummary> {
  const source = options?.source ?? "cron";
  const summary: AutoDrawSummary = {
    checked: 0,
    drawn: 0,
    skipped: 0,
    errors: 0,
  };

  const admin = createAdminClient();

  let query = admin
    .from("raffles")
    .select(
      "id, title, status, draw_date, draw_commitment, created_by",
    )
    .eq("auto_draw", true)
    .in("status", ["active", "closed"])
    .lte("draw_date", new Date().toISOString())
    .order("draw_date", { ascending: true })
    .limit(50);

  if (options?.raffleId) {
    query = query.eq("id", options.raffleId);
  }

  const { data, error } = await query;

  if (error) throw error;

  const raffles = (data ?? []) as AutoDrawRaffle[];

  for (const raffle of raffles) {
    summary.checked += 1;

    try {
      if (!raffle.draw_commitment) {
        const reason =
          "El sorteo no tiene el compromiso de semilla publicado.";
        await handleFailure(admin, raffle, source, reason);
        summary.skipped += 1;
        continue;
      }

      const { count, error: countError } = await admin
        .from("raffle_numbers")
        .select("id", { count: "exact", head: true })
        .eq("raffle_id", raffle.id)
        .eq("status", "sold");

      if (countError) {
        throw new Error(countError.message);
      }

      if (!count) {
        const reason = "No hay números vendidos para sortear.";
        await handleFailure(admin, raffle, source, reason);
        summary.skipped += 1;
        continue;
      }

      // Cierra ventas antes de sortear para que no entre un número en el
      // último segundo. El núcleo vuelve a validar estado y bloquea la fila.
      await admin
        .from("raffles")
        .update({ status: "closed" })
        .eq("id", raffle.id)
        .eq("status", "active");

      const { data: result, error: drawError } = await admin.rpc(
        "draw_winner_system",
        { p_raffle_id: raffle.id },
      );

      if (drawError) {
        const message = drawErrorMessage(drawError);
        if (message.includes("ya fue sorteado")) {
          await logRun(admin, raffle.id, source, "skipped", message);
          summary.skipped += 1;
          continue;
        }

        await handleFailure(admin, raffle, source, message);
        summary.errors += 1;
        continue;
      }

      const row = (Array.isArray(result) ? result[0] : result) as
        | { winning_number?: number; winner_user?: string | null }
        | null;

      const winningNumber = Number(row?.winning_number ?? 0);

      await logRun(
        admin,
        raffle.id,
        source,
        "success",
        null,
        winningNumber || null,
      );

      summary.drawn += 1;

      if (winningNumber) {
        await notifyWinner(
          admin,
          raffle.id,
          row?.winner_user ?? null,
          winningNumber,
          raffle.title,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error desconocido";
      console.error("[auto-draw]", raffle.id, message);
      if (!(await wasRecentlyNotified(admin, raffle.id, message))) {
        await logRun(admin, raffle.id, source, "error", message);
        await notifyOrganizerFailure(admin, raffle, message);
      }
      summary.errors += 1;
    }
  }

  return summary;
}

/**
 * Fallback perezoso: se llama al abrir la página pública de un sorteo opt-in.
 * Devuelve `true` si esta llamada efectivamente sorteó.
 */
export async function maybeAutoDrawRaffle(raffleId: string): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return false;

  try {
    const admin = createAdminClient();
    const { data: raffle } = await admin
      .from("raffles")
      .select("id, auto_draw, status, draw_date, draw_commitment")
      .eq("id", raffleId)
      .maybeSingle();

    if (
      !raffle ||
      !raffle.auto_draw ||
      raffle.status === "drawn" ||
      !["active", "closed"].includes(raffle.status as string) ||
      !raffle.draw_commitment ||
      new Date(raffle.draw_date as string).getTime() > Date.now()
    ) {
      return false;
    }

    const summary = await processAutoDraws({
      raffleId,
      source: "lazy",
    });

    return summary.drawn > 0;
  } catch (error) {
    console.error("[auto-draw] fallback perezoso:", error);
    return false;
  }
}

/**
 * Avisa una sola vez al organizador que un sorteo en modo manual ya llegó a
 * su fecha/hora. Se llama desde el cron y desde el fallback público.
 */
export async function processManualDrawReminders(options?: {
  raffleId?: string;
}): Promise<{ checked: number; notified: number }> {
  const summary = { checked: 0, notified: 0 };
  const admin = createAdminClient();

  let query = admin
    .from("raffles")
    .select("id, title, created_by, draw_date")
    .eq("auto_draw", false)
    .in("status", ["active", "closed"])
    .lte("draw_date", new Date().toISOString())
    .is("manual_draw_notified_at", null)
    .not("draw_commitment", "is", null)
    .order("draw_date", { ascending: true })
    .limit(50);

  if (options?.raffleId) {
    query = query.eq("id", options.raffleId);
  }

  const { data, error } = await query;

  if (error) throw error;

  for (const raffle of (data ?? []) as {
    id: string;
    title: string;
    created_by: string | null;
    draw_date: string;
  }[]) {
    summary.checked += 1;

    try {
      const { count } = await admin
        .from("raffle_numbers")
        .select("id", { count: "exact", head: true })
        .eq("raffle_id", raffle.id)
        .eq("status", "sold");

      if (!count || !raffle.created_by) continue;

      const { data: profile } = await admin
        .from("profiles")
        .select("email, full_name")
        .eq("id", raffle.created_by)
        .maybeSingle();

      if (profile?.email) {
        await sendManualDrawReadyEmail({
          to: profile.email as string,
          organizerName: (profile.full_name as string | null) ?? null,
          raffleTitle: raffle.title,
          raffleId: raffle.id,
          drawDate: new Date(raffle.draw_date).toLocaleString("es-AR", {
            timeZone: "America/Argentina/Buenos_Aires",
            dateStyle: "short",
            timeStyle: "short",
          }),
        });
      }

      await admin
        .from("raffles")
        .update({ manual_draw_notified_at: new Date().toISOString() })
        .eq("id", raffle.id)
        .is("manual_draw_notified_at", null);

      await admin.from("auto_draw_runs").insert({
        raffle_id: raffle.id,
        source: "manual",
        status: "skipped",
        message: "Aviso enviado: el sorteo manual está listo para ejecutar.",
      });

      summary.notified += 1;
    } catch (error) {
      console.error("[manual-draw] aviso al organizador:", raffle.id, error);
    }
  }

  return summary;
}

/** Fallback del aviso manual: se llama al abrir el sorteo después de la hora. */
export async function maybeNotifyManualDraw(
  raffleId: string,
): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return false;

  try {
    const admin = createAdminClient();
    const { data: raffle } = await admin
      .from("raffles")
      .select(
        "id, auto_draw, status, draw_date, draw_commitment, manual_draw_notified_at",
      )
      .eq("id", raffleId)
      .maybeSingle();

    if (
      !raffle ||
      raffle.auto_draw ||
      raffle.status === "drawn" ||
      !["active", "closed"].includes(raffle.status as string) ||
      !raffle.draw_commitment ||
      raffle.manual_draw_notified_at ||
      new Date(raffle.draw_date as string).getTime() > Date.now()
    ) {
      return false;
    }

    const summary = await processManualDrawReminders({ raffleId });
    return summary.notified > 0;
  } catch (error) {
    console.error("[manual-draw] fallback del aviso:", error);
    return false;
  }
}
