import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/auth";
import type { Raffle } from "@/lib/types";

import { EditarSorteoForm } from "./EditarSorteoForm";

export const dynamic = "force-dynamic";

/**
 * Editar sorteo: la carga y la pertenencia se resuelven en el servidor.
 * Las escrituras las hace la Server Action `updateRaffle`, que valida con Zod
 * y exige dueño (`owns_raffle`); el cliente no escribe en Supabase.
 */
export default async function EditarSorteoPage({
  params,
}: {
  params: { id: string };
}) {
  const actor = await requireAdminSession();
  if (!actor) redirect("/login");

  const supabase = createClient();
  const { data } = await supabase
    .from("raffles")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!data) notFound();
  if (!actor.isSuper && data.created_by !== actor.id) notFound();

  return <EditarSorteoForm raffle={data as Raffle} />;
}
