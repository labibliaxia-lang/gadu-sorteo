import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, ShieldCheck, Ticket, Trophy } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Centro de ayuda | Gadu Sorteos",
  description:
    "Cómo comprar números, cómo pagar por transferencia, cómo se elige el ganador y qué hacer si algo no funciona.",
};

const WA_PHONE = (process.env.NEXT_PUBLIC_SALES_WHATSAPP ?? "").replace(
  /\D/g,
  "",
);

function whatsappHref(): string {
  if (!WA_PHONE) return "/planes";
  return `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(
    "Hola! Necesito ayuda con Gadu Sorteos.",
  )}`;
}

const TOC = [
  { href: "#comprar", label: "Comprar números" },
  { href: "#pagar", label: "Pagar" },
  { href: "#sorteo", label: "El sorteo y la transparencia" },
  { href: "#ganaste", label: "Si ganaste" },
  { href: "#organizadores", label: "Organizadores y planes" },
  { href: "#problemas", label: "Problemas frecuentes" },
];

export default function AyudaPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-amber-600">
          Centro de ayuda
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Todo lo que necesitás saber
        </h1>
        <p className="text-muted-foreground">
          Guías cortas para comprar, pagar, seguir un sorteo y organizar el
          tuyo. Si no encontrás la respuesta, escribinos por WhatsApp.
        </p>
      </header>

      <nav className="rounded-xl border bg-muted/30 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ir a
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {TOC.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="text-amber-700 underline-offset-4 hover:underline dark:text-amber-400"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section id="comprar" className="scroll-mt-24 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Ticket className="h-5 w-5 text-amber-500" /> Comprar números
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Entrá con tu cuenta de Google (es la forma de identificar tus números).</li>
          <li>
            Elegí el sorteo y tocá los números que quieras. Después presioná
            «Reservar».
          </li>
          <li>
            La reserva dura <strong>48 horas</strong>. Si no se paga en ese
            plazo, los números vuelven a estar disponibles.
          </li>
          <li>
            Cuando el organizador valida el pago, los números pasan a
            «vendidos» y te llega un email de confirmación.
          </li>
        </ol>
      </section>

      <section id="pagar" className="scroll-mt-24 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <MessageCircle className="h-5 w-5 text-amber-500" /> Pagar
        </h2>
        <p className="text-sm text-muted-foreground">
          El pago es por <strong>transferencia bancaria</strong>. Al reservar,
          la página te muestra los datos del organizador y un botón para abrir
          WhatsApp.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Transferí el total de tus números.</li>
          <li>Mandá el comprobante por WhatsApp al organizador.</li>
          <li>El organizador lo revisa y marca tu pago desde su panel.</li>
          <li>Recibís el email «¡Pago confirmado!» con tus números.</li>
        </ol>
        <p className="text-sm text-muted-foreground">
          Gadu no cobra con tarjeta en este momento. Desconfiá de cualquier
          mensaje que te pida datos de tarjeta.
        </p>
      </section>

      <section id="sorteo" className="scroll-mt-24 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <ShieldCheck className="h-5 w-5 text-amber-500" /> El sorteo y la
          transparencia
        </h2>
        <p className="text-sm text-muted-foreground">
          Antes de sortear, el organizador publica un <strong>compromiso</strong>{" "}
          (un hash) que fija la semilla secreta. Cuando se sortea, la semilla se
          revela y cualquiera puede comprobar el resultado:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>La página del sorteo muestra la semilla, los hashes y el número ganador.</li>
          <li>
            El <strong>verificador</strong> recalcula el hash en tu navegador con
            los números vendidos; si coincide, el resultado es el que corresponde.
          </li>
          <li>
            El resultado queda congelado en la base: no se puede cambiar después
            de sortear.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Podés ver todos los ganadores en el{" "}
          <Link href="/ganadores" className="text-amber-700 underline-offset-4 hover:underline dark:text-amber-400">
            Muro de Ganadores
          </Link>
          .
        </p>
      </section>

      <section id="ganaste" className="scroll-mt-24 space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Trophy className="h-5 w-5 text-amber-500" /> Si ganaste
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Te llega un email con el número ganador y el sorteo.</li>
          <li>
            Contactá al organizador (sus datos están en la página del sorteo)
            para coordinar la entrega del premio.
          </li>
          <li>
            Si el organizador no responde en 48 horas, escribinos por WhatsApp
            con el link del sorteo y tu número.
          </li>
        </ul>
      </section>

      <section id="organizadores" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl font-semibold">Organizadores y planes</h2>
        <p className="text-sm text-muted-foreground">
          Para crear sorteos necesitás una cuenta de organizador. Hay dos planes
          mensuales (Organizador y Premium) que se pagan por transferencia y se
          activan con un código. Los detalles y precios están en{" "}
          <Link href="/planes" className="text-amber-700 underline-offset-4 hover:underline dark:text-amber-400">
            Planes y precios
          </Link>
          .
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Creá el sorteo, cargá premios y compartí el link.</li>
          <li>Revisá las reservas y marcá como pagados los comprobantes.</li>
          <li>
            Publicá el compromiso antes de sortear; el sistema no permite
            sortear sin él.
          </li>
        </ul>
      </section>

      <section id="problemas" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl font-semibold">Problemas frecuentes</h2>

        {[
          {
            q: "Reservé números y no me llegó el email",
            a: "Revisá spam. Si no aparece, entrá a /mis-numeros para confirmar que la reserva existe. Si la reserva está y el email no llegó, puede ser la configuración de correo; escribinos con el link del sorteo.",
          },
          {
            q: "Transferí y el organizador no marca el pago",
            a: "Mandá el comprobante por WhatsApp al organizador desde la página del sorteo. Si pasaron 48 horas sin respuesta, escribinos y lo contactamos.",
          },
          {
            q: "Mi reserva desapareció",
            a: "Las reservas duran 48 horas. Si no se pagó en ese plazo, los números se liberan automáticamente y otra persona puede tomarlos.",
          },
          {
            q: "¿Se pueden cancelar o devolver números?",
            a: "Una reserva impaga se libera sola. Un pago confirmado es una venta: la devolución depende del organizador y de las condiciones del sorteo. Escribinos si hay un problema.",
          },
          {
            q: "¿Cómo sé que el sorteo no está arreglado?",
            a: "Porque el compromiso se publica antes y la semilla se revela después: con el verificador de la página podés recalcular el ganador vos mismo. Si el hash no coincide, no lo dudes y avisanos.",
          },
          {
            q: "¿Gadu cobra una comisión?",
            a: "El precio del número lo define el organizador. La comisión de la plataforma se acuerda con cada organizador y está en las condiciones del plan.",
          },
          {
            q: "Quiero ser organizador",
            a: "Entrá a /planes, elegí el plan y escribinos por WhatsApp. Te damos de alta y activamos el panel.",
          },
          {
            q: "Mi cuenta está suspendida",
            a: "Contactá al soporte con tu email. La suspensión bloquea reservas y acceso al panel; se puede revertir desde el panel de administración.",
          },
        ].map((item) => (
          <details
            key={item.q}
            className="rounded-lg border p-4 [&_summary]:cursor-pointer"
          >
            <summary className="text-sm font-semibold">{item.q}</summary>
            <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </section>

      <section className="space-y-3 rounded-xl border bg-muted/30 p-6">
        <h2 className="text-xl font-semibold">¿Seguís con dudas?</h2>
        <p className="text-sm text-muted-foreground">
          Escribinos y te respondemos lo antes posible.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={whatsappHref()}
            target={whatsappHref().startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
            className={buttonVariants()}
          >
            <MessageCircle className="mr-1.5 h-4 w-4" />
            Escribir por WhatsApp
          </a>
          <a
            href="mailto:francofsm84@gmail.com"
            className={buttonVariants({ variant: "outline" })}
          >
            Enviar email
          </a>
        </div>
        <p className="text-xs text-muted-foreground">
          Al usar Gadu aceptás los{" "}
          <Link href="/terminos" className="underline underline-offset-4">
            Términos y Condiciones
          </Link>{" "}
          y la{" "}
          <Link href="/privacidad" className="underline underline-offset-4">
            Política de Privacidad
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
