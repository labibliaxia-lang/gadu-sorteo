"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Borde de error del panel de superadmin.
 *
 * El `try/catch` de `page.tsx` cubre los fallos al cargar datos. Este boundary
 * cubre lo que el try/catch no puede: un error durante el render de la página
 * o de un componente hijo. Sin esto, Next muestra la pantalla genérica de
 * "Application error" y el superadmin pierde el panel completo.
 */
export default function SuperAdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("AdminSuper");

  useEffect(() => {
    console.error("[admin/super] error de render", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-16" role="alert">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
            {t("error.title")}
          </CardTitle>
          <CardDescription>{t("error.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={reset}>
              {t("error.retry")}
            </Button>
            <LocaleLink
              href="/admin"
              className={buttonVariants({ variant: "outline" })}
            >
              {t("error.back")}
            </LocaleLink>
          </div>
          {error.digest && (
            <p className="font-mono text-[11px] text-fg-subtle">
              {t("error.code", { code: error.digest })}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
