"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, ShieldCheck } from "lucide-react";

import {
  Link as LocaleLink,
  usePathname,
} from "@/src/i18n/navigation";
import { acceptTerms } from "@/app/actions/terms";
import { Button } from "@/components/ui/button";
import { PRIVACY_PATH, TERMS_PATH, TERMS_VERSION } from "@/lib/terms";

const ALLOWED_PATHS = [TERMS_PATH, PRIVACY_PATH, "/login", "/register", "/auth"];

/**
 * Bloqueo global de Términos:
 * - Cuenta sin aceptación (por ejemplo Google que entró sin el checkbox).
 * - Cuenta con una versión vieja: al cambiar TERMS_VERSION, debe reaceptar.
 *
 * Solo deja pasar las páginas legales y el login para poder leer/aceptar.
 */
export function TermsGate({
  accepted,
  hasAcceptedTerms,
  acceptedVersion,
}: {
  accepted: boolean;
  hasAcceptedTerms: boolean;
  acceptedVersion: string | null;
}) {
  const t = useTranslations("TermsGate");
  const pathname = usePathname();
  const [alreadyAccepted, setAlreadyAccepted] = useState(accepted);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAllowedPath = Boolean(
    pathname && ALLOWED_PATHS.some((path) => pathname.startsWith(path)),
  );
  const blocked = !alreadyAccepted && !isAllowedPath;

  useEffect(() => {
    if (!blocked) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [blocked]);

  if (alreadyAccepted || isAllowedPath) return null;

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const result = await acceptTerms();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAlreadyAccepted(true);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-gate-title"
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-600" />
          <h2 id="terms-gate-title" className="text-lg font-semibold">
            {hasAcceptedTerms ? t("updatedTitle") : t("title")}
          </h2>
        </div>

        <p className="mt-2 text-sm text-muted-foreground">
          {hasAcceptedTerms
            ? t("updatedText", { version: TERMS_VERSION })
            : t("introText")}
        </p>

        {hasAcceptedTerms && acceptedVersion && (
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {t("acceptedVersion", {
              accepted: acceptedVersion,
              current: TERMS_VERSION,
            })}
          </p>
        )}

        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-brand-500"
          />
          <span>
            {t.rich("termsRich", {
              terms: (chunks) => (
                <LocaleLink
                  href={TERMS_PATH}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-800 underline underline-offset-4 dark:text-brand-300"
                >
                  {chunks}
                </LocaleLink>
              ),
              privacy: (chunks) => (
                <LocaleLink
                  href={PRIVACY_PATH}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-800 underline underline-offset-4 dark:text-brand-300"
                >
                  {chunks}
                </LocaleLink>
              ),
            })}
          </span>
        </label>

        {error && (
          <p className="mt-3 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <Button
          className="mt-4 w-full"
          onClick={() => void onSubmit()}
          disabled={!checked || busy}
        >
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          {t("accept", { version: TERMS_VERSION })}
        </Button>
      </div>
    </div>
  );
}
