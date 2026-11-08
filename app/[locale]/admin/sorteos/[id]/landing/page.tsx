import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { requireAdminSession } from "@/lib/auth";
import { parseLandingContent } from "@/lib/landing";
import { createClient } from "@/lib/supabase/server";
import { LandingEditor } from "@/components/admin/LandingEditor";
import { CopyLandingLink } from "@/components/CopyLandingLink";

export const dynamic = "force-dynamic";

export default async function LandingBuilderPage({
  params,
}: {
  params: { id: string };
}) {
  const t = await getTranslations("AdminSorteosLanding");
  const session = await requireAdminSession();
  if (!session) redirect("/login");

  const supabase = createClient();

  const { data: raffle } = await supabase
    .from("raffles")
    .select("id, title, landing_content, status")
    .eq("id", params.id)
    .maybeSingle();

  if (!raffle) notFound();

  const { data: owns } = await supabase.rpc("owns_raffle", {
    p_raffle_id: params.id,
  });

  if (owns !== true) notFound();

  return (
    <div className="space-y-6">
      <LocaleLink
        href={`/admin/sorteos/${params.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </LocaleLink>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        <LocaleLink
          href={`/sorteos/${params.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-amber-800 underline-offset-4 hover:underline dark:text-amber-300"
        >
          {t("viewPublic")}
          <ExternalLink className="h-4 w-4" />
        </LocaleLink>
      </header>

      <div className="rounded-xl border bg-muted/30 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {t("linkNote")}
        </p>
        <CopyLandingLink raffleId={params.id} />
      </div>

      <LandingEditor
        raffleId={raffle.id}
        raffleTitle={raffle.title}
        initialBlocks={parseLandingContent(raffle.landing_content)}
      />
    </div>
  );
}
