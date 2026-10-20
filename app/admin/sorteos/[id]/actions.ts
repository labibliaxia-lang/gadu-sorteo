"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

type AdminContext = { id: string; isSuper: boolean } | null;

// Devuelve el admin autenticado (organizador o superadmin), o null.
async function getAdminUser(): Promise<AdminContext> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin" && profile?.role !== "superadmin") return null;
  return { id: user.id, isSuper: profile.role === "superadmin" };
}

// Verifica que el sorteo pertenezca al admin autenticado actual.
async function ownsRaffle(raffleId: string, userId: string): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase
    .from("raffles")
    .select("created_by")
    .eq("id", raffleId)
    .single();

  return data?.created_by === userId;
}

export async function deleteRaffle(raffleId: string) {
  const ctx = await getAdminUser();
  if (!ctx) return { ok: false, error: "No autorizado" };
  if (!ctx.isSuper && !(await ownsRaffle(raffleId, ctx.id))) {
    return { ok: false, error: "No autorizado" };
  }

  const supabase = createClient();
  let query = supabase.from("raffles").delete().eq("id", raffleId);
  if (!ctx.isSuper) query = query.eq("created_by", ctx.id);

  const { error } = await query;

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
  const ctx = await getAdminUser();
  if (!ctx) return { ok: false, error: "No autorizado" };
  if (!ctx.isSuper && !(await ownsRaffle(raffleId, ctx.id))) {
    return { ok: false, error: "No autorizado" };
  }

  const supabase = createClient();
  let query = supabase
    .from("raffles")
    .update({
      title: data.title,
      description: data.description ?? null,
      price_per_number: data.price_per_number,
      draw_date: new Date(data.draw_date).toISOString(),
    })
    .eq("id", raffleId);
  if (!ctx.isSuper) query = query.eq("created_by", ctx.id);

  const { error } = await query;

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${raffleId}`);
  return { ok: true };
}

export async function cloneRaffle(raffleId: string) {
  const ctx = await getAdminUser();
  if (!ctx) return { ok: false, error: "No autorizado" };
  if (!ctx.isSuper && !(await ownsRaffle(raffleId, ctx.id))) {
    return { ok: false, error: "No autorizado" };
  }

  const supabase = createClient();

  const { data: source } = await supabase
    .from("raffles")
    .select("*")
    .eq("id", raffleId)
    .single();

  if (!source) {
    return { ok: false, error: "Sorteo no encontrado" };
  }

  const { count: numberCount } = await supabase
    .from("raffle_numbers")
    .select("*", { count: "exact", head: true })
    .eq("raffle_id", raffleId);

  const { data: prizes } = await supabase
    .from("prizes")
    .select("*")
    .eq("raffle_id", raffleId);

  // Fecha futura (30 días) para el clon.
  const futureDate = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: cloned, error: insertError } = await supabase
    .from("raffles")
    .insert({
      title: `${source.title} (Copia)`,
      description: source.description,
      price_per_number: source.price_per_number,
      cover_image_url: source.cover_image_url,
      draw_date: futureDate,
      status: "active",
      created_by: ctx.id,
    })
    .select()
    .single();

  if (insertError || !cloned) {
    return {
      ok: false,
      error: insertError?.message ?? "No se pudo clonar el sorteo",
    };
  }

  // Duplicar premios (sin clonar números).
  if (prizes && prizes.length > 0) {
    const prizesToInsert = prizes.map((p) => ({
      raffle_id: cloned.id,
      position: p.position,
      title: p.title,
      description: p.description,
      image_url: p.image_url,
      image_url_2: p.image_url_2 ?? null,
      tool_number: p.tool_number,
    }));

    const { error: prizesError } = await supabase
      .from("prizes")
      .insert(prizesToInsert);

    if (prizesError) {
      // Rollback del clon.
      await supabase.from("raffles").delete().eq("id", cloned.id);
      return { ok: false, error: prizesError.message };
    }
  }

  // Genera un pool limpio con la misma cantidad que el original.
  if (numberCount && numberCount > 0) {
    const { error: numbersError } = await supabase.rpc(
      "create_raffle_numbers",
      { p_raffle_id: cloned.id, p_max_numbers: numberCount },
    );

    if (numbersError) {
      // Rollback del clon.
      await supabase.from("raffles").delete().eq("id", cloned.id);
      return { ok: false, error: numbersError.message };
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/sorteos");
  return { ok: true, raffleId: cloned.id };
}
