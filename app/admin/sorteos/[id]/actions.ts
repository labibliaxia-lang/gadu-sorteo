"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

async function isAdmin(): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return profile?.role === "admin";
}

export async function deleteRaffle(raffleId: string) {
  if (!(await isAdmin())) {
    return { ok: false, error: "No autorizado" };
  }

  const supabase = createClient();
  const { error } = await supabase.from("raffles").delete().eq("id", raffleId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/sorteos");
  return { ok: true };
}

export async function updateRaffle(
  raffleId: string,
  data: {
    title: string;
    description?: string | null;
    price_per_number: number;
    draw_date: string;
  },
) {
  if (!(await isAdmin())) {
    return { ok: false, error: "No autorizado" };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("raffles")
    .update({
      title: data.title,
      description: data.description ?? null,
      price_per_number: data.price_per_number,
      draw_date: new Date(data.draw_date).toISOString(),
    })
    .eq("id", raffleId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${raffleId}`);
  return { ok: true };
}
