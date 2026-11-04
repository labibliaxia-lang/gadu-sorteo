import Link from "next/link";
import { ArrowRight, CreditCard, Eye, MousePointerClick, Truck } from "lucide-react";

const STEPS = [
  {
    n: "01",
    icon: MousePointerClick,
    title: "Elegí tus números",
    desc: "Seleccionalos en la grilla del sorteo. Los que elegís quedan reservados a tu nombre mientras completás el pago.",
  },
  {
    n: "02",
    icon: CreditCard,
    title: "Transferí y avisá",
    desc: "Transferí el total con los datos del organizador y enviá el comprobante por WhatsApp. Cuando lo confirma, tus números pasan a vendidos.",
  },
  {
    n: "03",
    icon: Eye,
    title: "Sorteo verificable",
    desc: "El ganador se define con una semilla comprometida antes del sorteo. Cualquiera puede recalcularlo y comprobar que no se eligió después.",
  },
];

const GUARANTEES = [
  {
    icon: Eye,
    title: "Resultados públicos",
    desc: "Números vendidos, ganador, semilla y hash quedan a la vista en la página del sorteo.",
  },
  {
    icon: CreditCard,
    title: "Pago claro",
    desc: "Transferencia y comprobante por WhatsApp. Sin cobros automáticos ni sorpresas.",
  },
  {
    icon: Truck,
    title: "Entrega coordinada",
    desc: "El premio se entrega en cualquier punto de Argentina, coordinado con el organizador.",
  },
];

/**
 * Protocolo del sitio en tres pasos. Antes vivía escondido en un acordeón:
 * la transparencia es el argumento de venta, así que va siempre visible.
 */
export function HowItWorks() {
  return (
    <section className="space-y-8" aria-labelledby="protocolo">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">El protocolo</p>
          <h2
            id="protocolo"
            className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Tres pasos, sin letra chica.
          </h2>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-fg-subtle">
            Ni ruletas ocultas ni resultados que cambian: compra, pago y sorteo
            con la misma información disponible para todos.
          </p>
        </div>
        <Link
          href="/como-funciona"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
        >
          Ver la verificación completa
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <ol className="grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-3">
        {STEPS.map((step) => (
          <li key={step.n} className="bg-panel-1 p-6">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[0.18em] text-brand-accent">
                {step.n}
              </span>
              <step.icon
                className="h-4 w-4 text-fg-subtle"
                aria-hidden="true"
              />
            </div>
            <h3 className="mt-6 font-display text-lg font-semibold tracking-tight">
              {step.title}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-fg-subtle">
              {step.desc}
            </p>
          </li>
        ))}
      </ol>

      <ul className="grid gap-6 border-t border-hairline pt-8 sm:grid-cols-3">
        {GUARANTEES.map((item) => (
          <li key={item.title} className="flex gap-3">
            <span
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-panel-2 text-brand-accent ring-1 ring-hairline"
              aria-hidden="true"
            >
              <item.icon className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-[13px] font-semibold text-fg">{item.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-fg-subtle">
                {item.desc}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
