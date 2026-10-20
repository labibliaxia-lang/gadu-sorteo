"use client";

import { useState } from "react";
import {
  ChevronDown,
  CreditCard,
  Info,
  MousePointerClick,
  Trophy,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    icon: MousePointerClick,
    title: "Elegí tus números",
    desc: "Seleccioná los números de la suerte en un grid en tiempo real.",
  },
  {
    icon: CreditCard,
    title: "Pagá con Mercado Pago",
    desc: "Completá el pago de forma rápida, simple y 100% segura.",
  },
  {
    icon: Trophy,
    title: "¡Participá y ganá!",
    desc: "Seguí el sorteo en vivo y descubrí si sos el ganador.",
  },
];

export function HowItWorks() {
  const [open, setOpen] = useState(false);

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-sm transition hover:border-slate-400 hover:shadow-md dark:border-slate-700"
      >
        <Info className="h-4 w-4 text-amber-500" />
        ¿Cómo funciona este sistema?
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
        />
      </button>

      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="grid gap-6 pt-2 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <Card key={step.title} className="relative overflow-hidden">
                <CardContent className="space-y-3 p-6">
                  <span className="absolute right-4 top-3 text-5xl font-black text-muted-foreground/10">
                    {i + 1}
                  </span>
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                    <step.icon className="h-6 w-6" />
                  </span>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
