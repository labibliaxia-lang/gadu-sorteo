import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
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

  return (
    <div className="space-y-4">
      <Link
        href={`/admin/sorteos/${params.id}`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Volver al sorteo
      </Link>
      <EditarSorteoForm raffle={data as Raffle} />
    </div>
  );
}
