import Link from "next/link";
import {
  ArrowRight,
  CreditCard,
  Eye,
  MousePointerClick,
  Truck,
} from "lucide-react";

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
 * Bloque "El protocolo" con el simulador (demo) accesible.
 * En móvil los pasos se compactan y aparecen los dos accesos principales;
 * en desktop se mantiene la grilla de tres pasos y el botón del demo debajo.
 */
export function ProtocolSection() {
  return (
    <section className="space-y-6 sm:space-y-8" aria-labelledby="protocolo">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">El protocolo</p>
          <h2
            id="protocolo"
            className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-4xl"
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
          className="hidden items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg sm:inline-flex"
        >
          Ver la verificación completa
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <ol className="grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-3">
        {STEPS.map((step) => (
          <li key={step.n} className="bg-panel-1 p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[0.18em] text-brand-accent">
                {step.n}
              </span>
              <step.icon
                className="h-4 w-4 text-fg-subtle"
                aria-hidden="true"
              />
            </div>
            <h3 className="mt-2.5 font-display text-[15px] font-semibold tracking-tight sm:mt-6 sm:text-lg">
              {step.title}
            </h3>
            <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-fg-subtle sm:mt-2 sm:line-clamp-none sm:text-[13px]">
              {step.desc}
            </p>
          </li>
        ))}
      </ol>

      {/* Garantías: solo desktop, para no alargar la Home en móvil. */}
      <ul className="hidden gap-6 border-t border-hairline pt-8 sm:grid sm:grid-cols-3">
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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Link
          href="/como-funciona#demo"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-hairline-strong bg-panel-2 px-4 text-[13px] font-medium text-fg transition-colors hover:border-brand-500/60 hover:text-brand-accent"
        >
          <span aria-hidden="true">🎲</span>
          Probar el motor (Demo)
        </Link>

        <Link
          href="/como-funciona"
          className="inline-flex h-11 items-center justify-center rounded-lg border border-hairline px-4 text-[13px] font-medium text-fg-muted transition-colors hover:border-hairline-strong hover:text-fg sm:hidden"
        >
          Ver protocolo completo
        </Link>
      </div>
    </section>
  );
}
