import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { routing } from "@/src/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Layout del segmento `[locale]`. El `<html>` y el `<body>` viven en
 * `app/layout.tsx` porque el admin y las rutas no migradas comparten el shell.
 */
export default function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  if (!hasLocale(routing.locales, params.locale)) {
    notFound();
  }

  // Deja el locale disponible para Server Components sin volver a leer headers.
  setRequestLocale(params.locale);

  return children;
}
