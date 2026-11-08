import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Lock, Plus, ShieldCheck } from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AdminNav } from "@/components/admin/AdminNav";
import { NotificationsBell } from "@/components/admin/NotificationsBell";
import { adminMfaRequired } from "@/lib/flags";
import { evaluateAdminMfaGate } from "@/lib/mfa";
import { lockAdminSession } from "@/app/[locale]/admin/verify/actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("AdminLayout");
  const locale = await getLocale();
  const inLocale = (path: string) =>
    locale === "es" ? path : `/${locale}${path}`;
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(inLocale("/login"));

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_banned")
    .eq("id", user.id)
    .single();

  const home = locale === "es" ? "/" : `/${locale}`;
  if (profile?.is_banned) redirect(home);
  if (profile?.role !== "admin" && profile?.role !== "superadmin") {
    redirect(home);
  }

  // Segundo factor. Con ADMIN_MFA_REQUIRED=true una sesión `aal1` no entra al
  // panel, aunque el rol sea correcto: el rol dice «qué puede hacer», el nivel
  // de garantía dice «cuánto demostró para entrar».
  const required = adminMfaRequired();
  const { data: assurance } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const gate = evaluateAdminMfaGate({
    required,
    currentLevel: assurance?.currentLevel,
    nextLevel: assurance?.nextLevel,
  });

  if (gate !== "ok") {
    redirect(
      `/seguridad?next=${encodeURIComponent(inLocale("/admin"))}`,
    );
  }

  // Con el flag apagado igual se ofrece el paso: es la única forma de que los
  // organizadores se enteren de que existe antes de exigirlo.
  const showMfaNudge = assurance?.currentLevel !== "aal2";

  return (
    <div className="space-y-8">
      <header className="space-y-5 border-b border-hairline pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="eyebrow">{t("eyebrow")}</p>
            <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-[-0.02em]">
              {t("title")}
            </h1>
            <p className="text-[13px] text-fg-subtle">{t("subtitle")}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {profile?.role === "superadmin" && (
              <form action={lockAdminSession}>
                <button
                  type="submit"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Lock className="mr-1.5 h-4 w-4" />
                  {t("lock")}
                </button>
              </form>
            )}
            <NotificationsBell />
            <LocaleLink
              href="/admin/sorteos/nuevo"
              className={cn(buttonVariants(), "w-full sm:w-auto")}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {t("newRaffle")}
            </LocaleLink>
          </div>
        </div>

        <AdminNav role={profile?.role === "superadmin" ? "superadmin" : "admin"} />
      </header>

      {showMfaNudge && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-panel-1 p-3">
          <p className="flex items-start gap-2 text-[13px] text-fg-subtle">
            <ShieldCheck
              className="mt-0.5 h-4 w-4 shrink-0 text-brand-accent"
              aria-hidden="true"
            />
            <span>{t("mfaNudge")}</span>
          </p>
          <Link
            href="/seguridad"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("enableMfa")}
          </Link>
        </div>
      )}

      {children}
    </div>
  );
}
