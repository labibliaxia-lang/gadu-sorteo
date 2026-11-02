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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Cómo funciona | Gadu Sorteos",
  description:
    "Cómo se eligen los números, cómo se confirma el pago y cómo se define y publica el ganador de cada sorteo.",
};

const STEPS = [
  {
    icon: Ticket,
    title: "1. Solo números vendidos",
    text: "Cada sorteo tiene una grilla con todos sus números. Podés elegir los que quieras y reservarlos. Cuando el organizador confirma tu pago, pasan a vendidos. El sorteo se juega únicamente con los números vendidos: nadie participa sin haber pagado.",
  },
  {
    icon: ShieldCheck,
    title: "2. Pago confirmado",
    text: "El pago es por transferencia: te mostramos los datos del organizador y enviás el comprobante por WhatsApp. El organizador revisa el comprobante y marca tus números como pagados desde el panel. Hasta que eso pasa, siguen reservados a tu nombre.",
  },
  {
    icon: Trophy,
    title: "3. Sorteo en la fecha publicada",
    text: "En la fecha y hora que indica el sorteo, el organizador ejecuta el sorteo desde el panel. El sistema elige al azar un número entre los vendidos. El resultado queda registrado y no se puede modificar: una vez sorteado, el ganador y la fecha quedan congelados.",
  },
  {
    icon: Eye,
    title: "4. Verificación pública",
    text: "El número ganador y el nombre del ganador se publican en la página del sorteo, a la vista de cualquiera. No hace falta tener cuenta para verlos. Los números vendidos también son públicos, así que podés controlar que el ganador haya estado en juego.",
  },
];

export default function ComoFuncionaPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-12">
      <header className="space-y-4 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
          <ShieldCheck className="h-4 w-4" />
          Transparencia total
        </span>
        <h1 className="text-4xl font-extrabold tracking-tight">
          ¿Cómo funciona Gadu Sorteos?
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Un sorteo simple: elegís tus números, pagás, el organizador confirma y
          el ganador se define entre los números vendidos, a la vista de todos.
        </p>
      </header>

      <section className="grid gap-5 sm:grid-cols-2">
        {STEPS.map((step) => (
          <Card key={step.title}>
            <CardHeader className="space-y-2">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                <step.icon className="h-5 w-5" />
              </span>
              <CardTitle className="text-lg">{step.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{step.text}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="rounded-2xl border bg-muted/30 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-foreground">
            <Hash className="h-5 w-5" />
          </span>
          <h2 className="text-xl font-semibold">
            Verificación con hashes: en camino
          </h2>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Queremos que puedas comprobar el resultado sin confiar en nadie. El
          siguiente paso es publicar una huella digital (hash) del listado de
          números vendidos antes del sorteo y otra del resultado después. Con eso
          cualquiera puede verificar que el listado no se modificó.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Hoy la garantía es distinta pero real: el resultado queda congelado en
          la base desde el momento del sorteo y los números vendidos son
          públicos. Cuando la verificación por hash esté disponible, se va a
          anunciar en esta misma página.
        </p>
      </section>

      <section className="rounded-2xl border p-6 sm:p-8">
        <h2 className="text-xl font-semibold">Lo que no hacemos</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>· No sorteamos entre números que nadie pagó.</li>
          <li>· No modificamos el resultado después del sorteo.</li>
          <li>· No vendemos ni compartimos tus datos con otros organizadores.</li>
          <li>· No prometemos premios que el organizador no haya publicado.</li>
        </ul>
      </section>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/#sorteos" className={buttonVariants({ size: "lg" })}>
          Ver sorteos activos
        </Link>
        <Link
          href="/planes"
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          <BadgeCheck className="mr-1.5 h-4 w-4" />
          Quiero organizar un sorteo
        </Link>
      </div>
    </div>
  );
}
