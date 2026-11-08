import type { Metadata } from "next";
import Image from "next/image";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { LoginForm } from "@/components/LoginForm";
import { PASSKEYS_ENABLED } from "@/lib/flags";
import { TERMS_COOKIE, termsCookieAccepted } from "@/lib/terms";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return {
    title: t("loginMetaTitle"),
    description: t("loginMetaDescription"),
  };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { error?: string; confirm?: string; next?: string };
}) {
  const t = await getTranslations("Auth");
  const next =
    searchParams.next ?? (params.locale === "es" ? null : `/${params.locale}`);
  const notice =
    searchParams.error === "auth"
      ? t("authError")
      : searchParams.confirm === "1"
        ? t("confirmNotice")
        : null;

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex w-fit items-center justify-center">
          <Image
            src="/logo-gadu-azul.png"
            alt="Gadu Sorteos"
            width={200}
            height={100}
            className="h-11 w-auto dark:hidden"
            priority
          />
          <Image
            src="/logo-gadu-blanco.png"
            alt=""
            aria-hidden="true"
            width={200}
            height={100}
            className="hidden h-11 w-auto dark:block"
            priority
          />
        </div>

        <h1 className="text-2xl font-bold tracking-tight">{t("welcome")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("loginSubtitle")}
        </p>

        {notice && (
          <p className="mt-4 rounded-lg bg-secondary/60 p-3 text-sm text-muted-foreground">
            {notice}
          </p>
        )}

        <div className="mt-6">
          <LoginForm
            next={next}
            termsAcceptedByCookie={termsCookieAccepted(
              cookies().get(TERMS_COOKIE)?.value,
            )}
          />
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          {t("noAccount")}
        </p>

        {PASSKEYS_ENABLED && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("passkeyNote")}
          </p>
        )}
      </div>
    </div>
  );
}
