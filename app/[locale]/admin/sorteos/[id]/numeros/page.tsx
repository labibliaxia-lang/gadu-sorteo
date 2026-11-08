import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { OrganizerNumbersManager } from "@/components/OrganizerNumbersManager";

export const dynamic = "force-dynamic";

export default async function SorteoNumerosPage({
  params,
}: {
  params: { id: string };
}) {
  const t = await getTranslations("AdminSorteosDetail");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin" && profile?.role !== "superadmin") {
    redirect("/");
  }

  const { data: raffle } = await supabase
    .from("raffles")
    .select("id, title, created_by")
    .eq("id", params.id)
    .single();

  if (!raffle) notFound();

  // El organizador solo gestiona los números de sus propios sorteos.
  if (profile.role !== "superadmin" && raffle.created_by !== user.id) {
    redirect("/admin/sorteos");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">
            {t("numbers.title", { title: raffle.title })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("numbers.subtitle")}
          </p>
        </div>
        <LocaleLink
          href={`/admin/sorteos/${params.id}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {t("numbers.back")}
        </LocaleLink>
      </div>

      <OrganizerNumbersManager raffleId={params.id} />
    </div>
  );
}
