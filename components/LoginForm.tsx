"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { PasskeyLoginButton } from "@/components/PasskeyLoginButton";
import {
  PRIVACY_PATH,
  TERMS_COOKIE,
  TERMS_PATH,
  TERMS_VERSION,
} from "@/lib/terms";

export function LoginForm({
  next,
  termsAcceptedByCookie = false,
}: {
  next: string | null;
  /** La cookie de consentimiento cubre la versión vigente: no hace falta tildar. */
  termsAcceptedByCookie?: boolean;
}) {
  const t = useTranslations("Auth");
  const [accepted, setAccepted] = useState(termsAcceptedByCookie);

  // Respaldo por si el rewrite del middleware no propaga la cookie de
  // consentimiento al Server Component: el navegador sí la ve.
  useEffect(() => {
    if (termsAcceptedByCookie) return;
    const hasCookie = document.cookie
      .split("; ")
      .some((entry) => entry === `${TERMS_COOKIE}=${TERMS_VERSION}`);
    if (hasCookie) setAccepted(true);
  }, [termsAcceptedByCookie]);

  return (
    <div className="space-y-4">
      {!termsAcceptedByCookie && (
        <label className="flex items-start gap-2 text-left text-sm">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-amber-600"
          />
          <span>
            {t.rich("termsRich", {
              terms: (chunks) => (
                <LocaleLink
                  href={TERMS_PATH}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-800 underline underline-offset-4 dark:text-amber-300"
                >
                  {chunks}
                </LocaleLink>
              ),
              privacy: (chunks) => (
                <LocaleLink
                  href={PRIVACY_PATH}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-800 underline underline-offset-4 dark:text-amber-300"
                >
                  {chunks}
                </LocaleLink>
              ),
            })}
          </span>
        </label>
      )}

      <GoogleAuthButton next={next} termsAccepted={accepted} />

      {/* Se dibuja entero o no se dibuja: sin el flag o sin WebAuthn en el
          navegador, este bloque no aparece. */}
      <PasskeyLoginButton next={next} termsAccepted={accepted} />

      {!accepted && (
        <p className="text-xs text-muted-foreground">
          {t("mustAccept")}
        </p>
      )}
    </div>
  );
}
