"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export async function markNumbersSold(raffleId: string, numbers: number[]) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("organizer_mark_sold", {
    p_raffle_id: raffleId,
    p_numbers: numbers,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/sorteos/${raffleId}/numeros`);
  revalidatePath(`/sorteos/${raffleId}`);
  return { ok: true, count: data as number };
}

export async function releaseNumbers(raffleId: string, numbers: number[]) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("organizer_release_numbers", {
    p_raffle_id: raffleId,
    p_numbers: numbers,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/sorteos/${raffleId}/numeros`);
  revalidatePath(`/sorteos/${raffleId}`);
  return { ok: true, count: data as number };
}
