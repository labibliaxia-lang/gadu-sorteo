"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  MessageCircle,
  Share2,
  Trophy,
  X,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface OrganizerOnboardingProps {
  /** Id del usuario, para que el "entendido" sea por cuenta. */
  userId: string;
  /** Se muestra solo si el organizador no tiene sorteos creados. */
  show: boolean;
}

const STEPS = [
  {
    icon: Trophy,
    title: "1. Creá tu sorteo",
    text: "Definí el premio, el precio del número y la fecha del sorteo. Después generá los números.",
  },
  {
    icon: Share2,
    title: "2. Compartí el link",
    text: "Mandá el enlace del sorteo por WhatsApp o redes. Cada visita y cada número vendido queda registrado.",
  },
  {
    icon: MessageCircle,
    title: "3. Validá los pagos y sorteá",
    text: "Revisá los comprobantes, marcá los números como pagados y publicá el compromiso antes de sortear.",
  },
];

/**
 * Tutorial de bienvenida del organizador. Se muestra una sola vez por cuenta
 * (localStorage) y solo mientras no tenga sorteos creados. No toca la base.
 */
export function OrganizerOnboarding({
  userId,
  show,
}: OrganizerOnboardingProps) {
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

  useEffect(() => {
    if (!visible) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // dismiss es estable por render; el listener solo depende de visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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
        className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="onboarding-title" className="text-xl font-bold">
              ¡Bienvenido a tu panel!
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Estos son los tres pasos para tu primer sorteo. Te los muestro una
              sola vez.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Cerrar tutorial"
            className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ol className="mt-5 space-y-4">
          {STEPS.map((step) => (
            <li key={step.title} className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                <step.icon className="h-5 w-5" />
              </span>
              <div className="space-y-0.5">
                <p className="font-semibold">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <Link
            href="/admin/sorteos/nuevo"
            onClick={dismiss}
            className={cn(buttonVariants(), "bg-amber-600 hover:bg-amber-700")}
          >
            Crear mi primer sorteo
          </Link>
          <Button variant="outline" onClick={dismiss}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            Entendido
          </Button>
        </div>
      </div>
    </div>
  );
}
