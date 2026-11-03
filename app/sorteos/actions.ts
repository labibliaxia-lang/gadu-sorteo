"use server";

import { sendReservationEmail, sendOrganizerReservationEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Aviso por email después de reservar (no forma parte del flujo de WhatsApp ni
 * cambia la reserva: se llama "fire and forget" desde el grid público).
 *
 * Solo envía si los números están efectivamente reservados por el usuario de
 * la sesión: así nadie puede usar la acción para mandar correos por terceros.
 */
export async function notifyReservation(
  raffleId: string,
  numbers: number[],
): Promise<void> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return;

    const clean = Array.from(
      new Set(
        (Array.isArray(numbers) ? numbers : []).filter(
          (n) => Number.isInteger(n) && n >= 1 && n <= 10000,
        ),
      ),
    ).slice(0, 100);

    if (clean.length === 0) return;

    const { data: rows } = await supabase
      .from("raffle_numbers")
      .select("number")
      .eq("raffle_id", raffleId)
      .eq("reserved_by", user.id)
      .eq("status", "reserved")
      .in("number", clean);

    // Si la reserva no coincide (expiró o es ajena), no se envía nada.
    if (!rows || rows.length !== clean.length) return;

    const { data: raffle } = await supabase
      .from("raffles")
      .select("title, created_by")
      .eq("id", raffleId)
      .maybeSingle();

    if (!raffle) return;

    // Consentimiento: sin aceptación de Términos o con avisos desactivados,
    // no se envía nada.
    const { data: profile } = await supabase
      .from("profiles")
      .select("email_opt_in, terms_accepted_at")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.email_opt_in || !profile.terms_accepted_at) return;

    await sendReservationEmail({
      to: user.email,
      raffleTitle: raffle.title as string,
      raffleId,
      numbers: clean,
    });

    // Aviso al organizador (solo si dio consentimiento y no está suspendido).
    const organizerId = raffle.created_by as string | null;
    if (organizerId && organizerId !== user.id) {
      const admin = createAdminClient();
      const { data: organizer } = await admin
        .from("profiles")
        .select("email, full_name, email_opt_in, terms_accepted_at, is_banned")
        .eq("id", organizerId)
        .maybeSingle();

      if (
        organizer?.email &&
        organizer.email_opt_in &&
        organizer.terms_accepted_at &&
        !organizer.is_banned
      ) {
        await sendOrganizerReservationEmail({
          to: organizer.email as string,
          organizerName: organizer.full_name as string | null,
          raffleTitle: raffle.title as string,
          raffleId,
          numbers: clean,
        });
      }
    }
  } catch (error) {
    console.error("[email] reserva:", error);
  }
}
