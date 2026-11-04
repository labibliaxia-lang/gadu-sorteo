import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  Eye,
  Hash,
  ShieldCheck,
  Ticket,
  Trophy,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Cómo funciona | Gadu Sorteos",
  description:
    "Cómo se eligen los números, cómo se confirma el pago y cómo se define y publica el ganador de cada sorteo.",
};

const STEPS = [
  {
    n: "01",
    icon: Ticket,
    title: "Solo números vendidos",
    text: "Cada sorteo tiene una grilla con todos sus números. Podés elegir los que quieras y reservarlos. Cuando el organizador confirma tu pago, pasan a vendidos. El sorteo se juega únicamente con los números vendidos: nadie participa sin haber pagado.",
  },
  {
    n: "02",
    icon: ShieldCheck,
    title: "Pago confirmado",
    text: "El pago es por transferencia: te mostramos los datos del organizador y enviás el comprobante por WhatsApp. El organizador revisa el comprobante y marca tus números como pagados desde el panel. Hasta que eso pasa, siguen reservados a tu nombre.",
  },
  {
    n: "03",
    icon: Trophy,
    title: "Sorteo en la fecha publicada",
    text: "En la fecha y hora que indica el sorteo, el organizador ejecuta el sorteo desde el panel. El sistema elige al azar un número entre los vendidos. El resultado queda registrado y no se puede modificar: una vez sorteado, el ganador y la fecha quedan congelados.",
  },
  {
    n: "04",
    icon: Eye,
    title: "Verificación pública",
    text: "El número ganador y el nombre del ganador se publican en la página del sorteo, a la vista de cualquiera. No hace falta tener cuenta para verlos. Los números vendidos también son públicos, así que podés controlar que el ganador haya estado en juego.",
  },
];

const FORMULA =
  "sha256( gadu:v1 | raffle:<id> | seed:<semilla> | numbers:n1,n2,...,nN )";

export default function ComoFuncionaPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-16">
      <header className="space-y-5 border-b border-hairline pb-10">
        <p className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-brand-accent" aria-hidden="true" />
          <span className="eyebrow-gold">Transparencia total</span>
        </p>
        <h1 className="max-w-2xl text-balance font-display text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-5xl">
          ¿Cómo funciona Gadu Sorteos?
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-fg-muted">
          Un sorteo simple: elegís tus números, pagás, el organizador confirma y
          el ganador se define entre los números vendidos, a la vista de todos.
        </p>
        <div className="flex flex-wrap items-center gap-4 pt-2">
          <Link href="/#sorteos" className={buttonVariants()}>
            Ver sorteos activos
          </Link>
          <Link
            href="/planes"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <BadgeCheck className="h-4 w-4" aria-hidden="true" />
            Quiero organizar un sorteo
          </Link>
        </div>
      </header>

      <section className="space-y-8" aria-labelledby="pasos">
        <div>
          <p className="eyebrow">El recorrido</p>
          <h2
            id="pasos"
            className="mt-2 font-display text-3xl font-semibold tracking-tight"
          >
            De elegir un número a cobrar el premio.
          </h2>
        </div>

        <ol className="divide-y divide-hairline border-y border-hairline">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="grid gap-4 py-8 sm:grid-cols-[4rem_1fr] sm:gap-8"
            >
              <div className="flex items-center gap-3 sm:block">
                <span className="font-mono text-[11px] tracking-[0.18em] text-brand-accent">
                  {step.n}
                </span>
                <step.icon
                  className="h-4 w-4 text-fg-subtle sm:mt-3 sm:block"
                  aria-hidden="true"
                />
              </div>
              <div className="space-y-2">
                <h3 className="font-display text-xl font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="max-w-2xl text-[13px] leading-relaxed text-fg-subtle">
                  {step.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="rounded-xl border border-hairline bg-panel-1 p-6 sm:p-8"
        aria-labelledby="verificacion"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-panel-3 text-brand-accent ring-1 ring-hairline">
            <Hash className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2
            id="verificacion"
            className="font-display text-xl font-semibold tracking-tight"
          >
            Verificación con hash y semilla comprometida
          </h2>
          <Badge variant="success" className="ml-auto">
            <ShieldCheck className="h-3 w-3" />
            SHA-256
          </Badge>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-fg-subtle">
          Antes de sortear, el organizador publica el compromiso: el hash
          SHA-256 de una semilla secreta que genera el sistema. Nadie conoce esa
          semilla hasta el momento del sorteo, y el compromiso queda congelado:
          no se puede cambiar ni retirar.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-fg-subtle">
          Al ejecutarse el sorteo, la base usa esa semilla junto con el listado
          de números vendidos para calcular al ganador, y revela la semilla.
          Cualquiera puede entonces recalcular el ganador y comprobar dos cosas:
          que la semilla era la misma que se había comprometido antes, y que el
          resultado se deriva de ella.
        </p>

        <div className="mt-5 rounded-lg border border-hairline bg-panel-2 p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
            La cuenta que hace el sistema
          </p>
          <code className="mt-2 block break-all font-mono text-[12px] leading-relaxed text-fg-muted">
            {FORMULA}
          </code>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
            primeros 15 caracteres hex ÷ números vendidos → resto = posición del
            ganador
          </p>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-fg-subtle">
          Además, la base calcula dos huellas SHA-256: una del listado completo
          de números vendidos y otra del mismo listado junto con el número
          ganador. Ambas quedan publicadas y congeladas en la página del sorteo,
          con el paso a paso exacto para verificarlas. En cada sorteo finalizado
          hay un verificador automático: se ejecuta en tu navegador, no consulta
          la base, y te dice si la semilla, el listado y el ganador coinciden con
          lo publicado.
        </p>
      </section>

      <section
        className="rounded-xl border border-hairline bg-panel-1/50 p-6 sm:p-8"
        aria-labelledby="no-hacemos"
      >
        <h2
          id="no-hacemos"
          className="font-display text-xl font-semibold tracking-tight"
        >
          Lo que no hacemos
        </h2>
        <ul className="mt-4 divide-y divide-hairline">
          {[
            "No sorteamos entre números que nadie pagó.",
            "No modificamos el resultado después del sorteo.",
            "No vendemos ni compartimos tus datos con otros organizadores.",
            "No prometemos premios que el organizador no haya publicado.",
          ].map((line) => (
            <li
              key={line}
              className="flex items-start gap-3 py-3 text-[13px] text-fg-muted"
            >
              <span
                className="mt-1.5 h-px w-4 shrink-0 bg-brand-500"
                aria-hidden="true"
              />
              {line}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
