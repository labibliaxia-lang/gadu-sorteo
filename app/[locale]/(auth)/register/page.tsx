import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { LoginForm } from "@/components/LoginForm";
import { TERMS_COOKIE, termsCookieAccepted } from "@/lib/terms";

export const dynamic = "force-dynamic";



export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return {
    title: t("registerMetaTitle"),
    description: t("registerMetaDescription"),
    robots: { index: false, follow: true },
  };
}

/**
 * Registro con Google. La cuenta se crea en el primer inicio de sesión, pero
 * esta pantalla existe para que el alta tenga su propio checkbox de T&C.
 * La aceptación se guarda en profiles.terms_accepted_at desde el callback.
 */
export default async function RegisterPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations("Auth");
  const next = params.locale === "es" ? null : `/${params.locale}`;

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("registerTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("registerSubtitle")}
        </p>

        <div className="mt-6 text-left">
          <LoginForm
            next={next}
            termsAcceptedByCookie={termsCookieAccepted(
              cookies().get(TERMS_COOKIE)?.value,
            )}
          />
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          {t("alreadyHaveAccount")}{" "}
          <LocaleLink
            href="/login"
            className="text-amber-800 underline underline-offset-4 dark:text-amber-300"
          >
            {t("signIn")}
          </LocaleLink>
        </p>
      </div>
    </div>
  );
}
