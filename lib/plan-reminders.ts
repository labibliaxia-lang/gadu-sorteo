import { sendPlanExpiryWarningEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Envía recordatorios de vencimiento de plan a 7, 3 y 1 día.
 *
 * Lo llama el cron. La tabla `plan_reminder_sends` (0039) evita duplicados por
 * usuario, umbral y fecha de vencimiento. Si faltan las variables de Resend,
 * `sendEmail` devuelve false y no se registra el envío.
 */
const REMINDER_DAYS = [7, 3, 1] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PlanReminderResult {
  sent: number;
  skipped: number;
  failed: number;
}

function daysUntil(expiry: Date, now: Date): number {
  return Math.ceil((expiry.getTime() - now.getTime()) / DAY_MS);
}

function formatDate(value: Date): string {
  return value.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export async function sendPlanReminderEmails(): Promise<PlanReminderResult> {
  const admin = createAdminClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + 8 * DAY_MS).toISOString();

  const { data: profiles, error } = await admin
    .from("profiles")
    .select(
      "id, email, full_name, role, plan, plan_expires_at, role_expires_at, email_opt_in, terms_accepted_at, is_banned",
    )
    .eq("role", "admin")
    .not("role_expires_at", "is", null)
    .gte("role_expires_at", now.toISOString())
    .lte("role_expires_at", horizon);

  if (error) {
    console.error("[plan-reminders] no se pudieron leer los perfiles:", error.message);
    return { sent: 0, skipped: 0, failed: 0 };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const profile of profiles ?? []) {
    const rawExpiry =
      (profile.plan === "premium" && profile.plan_expires_at) ||
      profile.role_expires_at;

    if (!rawExpiry) {
      skipped += 1;
      continue;
    }

    const expiry = new Date(rawExpiry as string);
    const daysLeft = daysUntil(expiry, now);

    if (!REMINDER_DAYS.includes(daysLeft as (typeof REMINDER_DAYS)[number])) {
      skipped += 1;
      continue;
    }

    if (
      !profile.email ||
      !profile.email_opt_in ||
      !profile.terms_accepted_at ||
      profile.is_banned
    ) {
      skipped += 1;
      continue;
    }

    const { data: already } = await admin
      .from("plan_reminder_sends")
      .select("id")
      .eq("user_id", profile.id)
      .eq("days_before", daysLeft)
      .eq("expires_at", expiry.toISOString())
      .maybeSingle();

    if (already) {
      skipped += 1;
      continue;
    }

    const delivered = await sendPlanExpiryWarningEmail({
      to: profile.email as string,
      name: profile.full_name as string | null,
      plan: (profile.plan as string) || "organizador",
      daysLeft,
      expiresAt: formatDate(expiry),
    });

    if (!delivered) {
      failed += 1;
      continue;
    }

    const { error: logError } = await admin
      .from("plan_reminder_sends")
      .insert({
        user_id: profile.id,
        days_before: daysLeft,
        expires_at: expiry.toISOString(),
      });

    if (logError) {
      console.error("[plan-reminders] no se pudo registrar el envío:", logError.message);
    }

    sent += 1;
  }

  return { sent, skipped, failed };
}
