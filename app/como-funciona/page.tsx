import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Eye,
  Hash,
  Play,
  ShieldCheck,
  Ticket,
  Trophy,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DemoExperience } from "@/components/SandboxDraw";

export const metadata: Metadata = {
  title: "Cómo funciona | Gadu Sorteos",
  description:
    "Cómo se eligen los números, cómo se confirma el pago y cómo se define y publica el ganador de cada sorteo.",
};

/** Resalta un concepto clave dentro de una lista. */
function Key({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-fg">{children}</strong>;
}

const STEPS = [
  {
    n: "01",
    icon: Ticket,
    title: "Solo números vendidos",
    points: [
      <>
        El sorteo se juega únicamente con <Key>números vendidos</Key>: nadie
        participa sin haber pagado.
      </>,
      <>Elegís tus números y quedan reservados a tu nombre.</>,
      <>
        Cuando el organizador confirma el pago, pasan a vendidos y entran al
        sorteo.
      </>,
    ],
  },
  {
    n: "02",
    icon: ShieldCheck,
    title: "Pago confirmado",
    points: [
      <>
        El pago es por <Key>transferencia</Key>: te mostramos los datos del
        organizador.
      </>,
      <>Enviás el comprobante por WhatsApp.</>,
      <>
        El organizador revisa y marca tus números como pagados. Hasta entonces
        siguen reservados a tu nombre.
      </>,
    ],
  },
  {
    n: "03",
    icon: Trophy,
    title: "Sorteo en la fecha publicada",
    points: [
      <>
        El organizador ejecuta el sorteo en la <Key>fecha y hora</Key>{" "}
        publicadas.
      </>,
      <>El sistema elige al azar un número entre los vendidos.</>,
      <>
        El <Key>resultado</Key> queda registrado y no se puede modificar: una
        vez sorteado, el ganador y la fecha quedan congelados.
      </>,
    ],
  },
  {
    n: "04",
    icon: Eye,
    title: "Verificación pública",
    points: [
      <>
        El <Key>resultado</Key> se publica a la vista de cualquiera, sin
        necesidad de cuenta.
      </>,
      <>Los <Key>números vendidos</Key> también son públicos.</>,
      <>
        El <Key>hash</Key> y la semilla te dejan verificar que el ganador
        estuvo en juego.
      </>,
    ],
  },
];

const FORMULA =
  "sha256( gadu:v1 | raffle:<id> | seed:<semilla> | numbers:n1,n2,...,nN )";

const CHECK_ITEMS = [
  "Mirá la misma puesta en escena del sorteo en vivo.",
  "Armá tu escenario con tus números y nombres de premios.",
  "Publicá el hash y verificá el resultado paso a paso.",
  "Nada de lo que hagas acá toca sorteos reales.",
];

export default function ComoFuncionaPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-16">
      <header className="space-y-5 border-b border-hairline pb-10">
        <p className="flex items-center gap-2">
          <ShieldCheck
            className="h-3.5 w-3.5 text-brand-accent"
            aria-hidden="true"
          />
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
                <ul className="space-y-1.5 text-[13px] leading-relaxed text-fg-subtle">
                  {step.points.map((point, index) => (
                    <li key={index} className="flex gap-2">
                      <span
                        className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-brand-500"
                        aria-hidden="true"
                      />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
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
          Antes de sortear, el organizador publica el{" "}
          <Key>compromiso</Key>: el <Key>hash</Key> SHA-256 de una semilla
          secreta. Ese compromiso queda congelado y no se puede cambiar ni
          retirar.
        </p>

        <ul className="mt-4 space-y-2 text-[13px] leading-relaxed text-fg-subtle">
          {[
            <>
              La semilla se genera antes del sorteo y permanece oculta hasta el
              momento de revelar.
            </>,
            <>
              Al revelar, cualquiera puede recalcular el ganador con la semilla
              y el listado de <Key>números vendidos</Key>.
            </>,
            <>
              Un <Key>verificador</Key> automático corre en tu navegador y te
              dice si todo coincide con lo publicado.
            </>,
          ].map((item, index) => (
            <li key={index} className="flex gap-2">
              <span
                className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-brand-500"
                aria-hidden="true"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <details className="group mt-5 rounded-xl border border-hairline bg-panel-2 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-fg">
            Ver detalles técnicos
            <span
              className="text-fg-subtle transition-transform group-open:rotate-180"
              aria-hidden="true"
            >
              ▾
            </span>
          </summary>
          <div className="mt-4 space-y-4 text-[13px] leading-relaxed text-fg-subtle">
            <p>
              Al ejecutarse el sorteo, la base usa la semilla junto con el
              listado de números vendidos para calcular al ganador y revela la
              semilla. Cualquiera puede recalcular el resultado y comprobar que
              la semilla era la misma que se había comprometido antes.
            </p>

            <div className="rounded-lg border border-hairline bg-panel-1 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
                La cuenta que hace el sistema
              </p>
              <code className="mt-2 block break-all font-mono text-[12px] leading-relaxed text-fg-muted">
                {FORMULA}
              </code>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
                primeros 15 caracteres hex ÷ números vendidos → resto = posición
                del ganador
              </p>
            </div>

            <p>
              Además, la base calcula dos huellas SHA-256: una del listado
              completo de números vendidos y otra del mismo listado junto con el
              número ganador. Ambas quedan publicadas y congeladas en la página
              del sorteo, con el paso a paso exacto para verificarlas.
            </p>
          </div>
        </details>
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

      <section
        id="demo"
        className="scroll-mt-24 rounded-xl border border-hairline bg-panel-1 p-6 sm:p-8"
        aria-labelledby="demo-title"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-panel-3 text-brand-accent ring-1 ring-hairline">
            <Play className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2
            id="demo-title"
            className="font-display text-xl font-semibold tracking-tight"
          >
            Probalo vos mismo: Simulador de Sorteo
          </h2>
        </div>

        <div
          role="note"
          className="mt-4 flex items-start gap-3 rounded-xl border-2 border-dashed border-violet-500/60 bg-violet-500/[0.09] p-3.5 dark:bg-violet-400/10"
        >
          <span aria-hidden="true" className="text-xl leading-none">
            🧪
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">
              MODO DEMO - SIMULACIÓN
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-violet-900/80 dark:text-violet-100/80">
              Estás en un entorno de pruebas. No se juegan premios reales.
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-2 text-[13px] leading-relaxed text-fg-subtle">
          {CHECK_ITEMS.map((item) => (
            <li key={item} className="flex gap-2">
              <span
                className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-brand-500"
                aria-hidden="true"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            {
              n: "1",
              title: "Mirá la animación",
              text: "La misma ceremonia, con los números y premios de tu escenario.",
            },
            {
              n: "2",
              title: "Armá tu escenario",
              text: "Elegí cuántos números y premios hay, y cuáles están vendidos.",
            },
            {
              n: "3",
              title: "Verificá el hash",
              text: "Publicá el compromiso y recalculá todo en tu navegador.",
            },
          ].map((step) => (
            <li
              key={step.n}
              className="rounded-lg border border-hairline bg-panel-2 p-3"
            >
              <p className="font-mono text-[11px] tracking-[0.18em] text-brand-accent">
                {step.n}
              </p>
              <p className="mt-1 text-[13px] font-semibold text-fg">
                {step.title}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-fg-subtle">
                {step.text}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-6">
          <DemoExperience />
        </div>

        <details className="group mt-5 rounded-xl border border-hairline bg-panel-2 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-fg">
            ¿Cómo se verifica esta demo?
          </summary>
          <div className="mt-3 space-y-2 text-[13px] leading-relaxed text-fg-subtle">
            <p>
              Antes de sortear, se publica el{" "}
              <strong className="text-fg">compromiso</strong>: el hash SHA-256
              de una semilla secreta que todavía no se conoce. El compromiso
              queda fijado y no se puede cambiar.
            </p>
            <p>
              Al revelar, se da a conocer la semilla. Cualquiera puede
              recalcular el hash y comprobar que coincide con el compromiso
              publicado. El resultado se deriva de esa semilla y del listado de
              números vendidos.
            </p>
            <p>
              La animación que viste no elige al ganador: solo lo muestra. En la
              pestaña interactiva, el cálculo corre entero en tu navegador, sin
              consultar la base.
            </p>
            <Link
              href="/ganadores"
              className="inline-flex text-sm text-brand-800 underline-offset-4 hover:underline dark:text-brand-300"
            >
              Ver sorteos ya verificados
            </Link>
          </div>
        </details>

        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-subtle">
          Sin registro · entorno aislado · hash y verificación en tu navegador
        </p>
      </section>
    </div>
  );
}
