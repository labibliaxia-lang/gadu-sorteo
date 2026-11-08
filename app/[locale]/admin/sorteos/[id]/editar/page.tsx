import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { generarBasesLegales } from "@/lib/raffle-terms";
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
  const t = await getTranslations("AdminSorteosForm");
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

  // 0105: posibles sorteos destino para los premios de referidos.
  const { data: candidatos } = await supabase
    .from("raffles")
    .select("id, title")
    .eq("created_by", data.created_by as string)
    .neq("id", params.id)
    .in("status", ["active", "closed"])
    .order("draw_date", { ascending: true })
    .limit(50);

  // 0113: bases legales sugeridas con los datos de KYC del organizador.
  const { data: owner } = await supabase
    .from("profiles")
    .select("full_name, dni_number")
    .eq("id", data.created_by as string)
    .maybeSingle();

  const basesSugeridas = generarBasesLegales({
    organizerName: (owner?.full_name as string | null) ?? null,
    organizerDoc: (owner?.dni_number as string | null) ?? null,
    raffleTitle: data.title as string,
    drawDateLabel: new Date(data.draw_date as string).toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
    }),
    priceLabel: `${Number(data.price_per_number)} ${(data.currency as string) ?? "ARS"}`,
    numbersCount: null,
    transferAlias: data.transfer_alias as string | null,
    transferCbu: data.transfer_cbu as string | null,
    transferBank: data.transfer_bank as string | null,
    whatsapp: data.whatsapp_contact as string | null,
  });

  return (
    <div className="space-y-4">
      <LocaleLink
        href={`/admin/sorteos/${params.id}`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        {t("back")}
      </LocaleLink>
      <EditarSorteoForm
        raffle={data as Raffle}
        basesSugeridas={basesSugeridas}
        sorteosBonus={(candidatos ?? []).map((c) => ({
          id: c.id as string,
          title: c.title as string,
        }))}
      />
    </div>
  );
}
