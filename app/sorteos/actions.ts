"use server";

import { sendReservationEmail } from "@/lib/email";
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
      .select("title")
      .eq("id", raffleId)
      .maybeSingle();

    if (!raffle) return;

    await sendReservationEmail({
      to: user.email,
      raffleTitle: raffle.title as string,
      raffleId,
      numbers: clean,
    });
  } catch (error) {
    console.error("[email] reserva:", error);
  }
}
