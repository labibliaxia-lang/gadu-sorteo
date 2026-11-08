"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  MessageCircle,
  Share2,
  Trophy,
  X,
} from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/lib/use-focus-trap";

interface OrganizerOnboardingProps {
  /** Id del usuario, para que el "entendido" sea por cuenta. */
  userId: string;
  /** Se muestra solo si el organizador no tiene sorteos creados. */
  show: boolean;
}

const STEPS = [
  { icon: Trophy, title: "step1Title", text: "step1Text" },
  { icon: Share2, title: "step2Title", text: "step2Text" },
  { icon: MessageCircle, title: "step3Title", text: "step3Text" },
] as const;

/**
 * Tutorial de bienvenida del organizador. Se muestra una sola vez por cuenta
 * (localStorage) y solo mientras no tenga sorteos creados. No toca la base.
 */
export function OrganizerOnboarding({
  userId,
  show,
}: OrganizerOnboardingProps) {
  const t = useTranslations("AdminOnboarding");
  const storageKey = `gadu:onboarding:${userId}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;

    try {
      if (window.localStorage.getItem(storageKey) === "done") return;
    } catch {
      // Si el navegador bloquea localStorage, se muestra igual.
    }

    setVisible(true);
  }, [show, storageKey]);

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey, "done");
    } catch {
      // Si no se puede guardar, al menos se cierra en esta visita.
    }
    setVisible(false);
  }

  const dialogRef = useFocusTrap<HTMLDivElement>(visible, dismiss);

  if (!show || !visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      onClick={dismiss}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="onboarding-title" className="text-xl font-bold">
              {t("welcomeTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("welcomeText")}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("closeAria")}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ol className="mt-5 space-y-4">
          {STEPS.map((step) => (
            <li key={step.title} className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-ink">
                <step.icon className="h-5 w-5" />
              </span>
              <div className="space-y-0.5">
                <p className="font-semibold">{t(step.title)}</p>
                <p className="text-sm text-muted-foreground">{t(step.text)}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <LocaleLink
            href="/admin/sorteos/nuevo"
            onClick={dismiss}
            className={cn(buttonVariants(), "bg-amber-600 hover:bg-amber-700")}
          >
            {t("createFirst")}
          </LocaleLink>
          <Button variant="outline" onClick={dismiss}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            {t("understood")}
          </Button>
        </div>
      </div>
    </div>
  );
}
