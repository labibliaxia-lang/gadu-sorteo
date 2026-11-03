import Link from "next/link";
import Image from "next/image";
import { Instagram, MessageCircle, ShieldCheck } from "lucide-react";

/** Número público de ventas; si falta, el bloque enlaza a /planes. */
function whatsappHref(): string {
  const phone = (process.env.NEXT_PUBLIC_SALES_WHATSAPP ?? "").replace(/\D/g, "");
  if (!phone) return "/planes";
  const text = encodeURIComponent(
    "Hola! Quiero consultar por Gadu Sorteos.",
  );
  return `https://wa.me/${phone}?text=${text}`;
}

export function Footer() {
  return (
    <footer className="mt-16 border-t bg-zinc-950 text-zinc-300">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        {/* Marca */}
        <div className="space-y-3 sm:col-span-2 lg:col-span-1">
          <Link href="/" className="inline-flex" aria-label="Gadu Sorteos — inicio">
            <span className="rounded-lg bg-white px-2 py-1.5 ring-1 ring-white/10">
              <Image
                src="/logo-gadu-wordmark.png"
                alt="Gadu Sorteos"
                width={112}
                height={44}
                className="h-7 w-auto"
              />
            </span>
          </Link>
          <p className="max-w-xs text-sm text-zinc-400">
            Sorteos transparentes con premios de todo tipo. Elegí tus números,
            participá y ganá.
          </p>
          <p className="flex items-start gap-2 text-xs text-zinc-400">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            Pago por transferencia y comprobante por WhatsApp.
          </p>
          <div className="flex gap-2 pt-1">
            <a
              href="https://www.instagram.com/jacinto.cards"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram de Gadu Sorteos"
              className="rounded-lg border border-zinc-800 p-2 transition hover:border-amber-400 hover:text-amber-400"
            >
              <Instagram className="h-4 w-4" />
            </a>
            <a
              href={whatsappHref()}
              target={whatsappHref().startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
              aria-label="WhatsApp de Gadu Sorteos"
              className="rounded-lg border border-zinc-800 p-2 transition hover:border-amber-400 hover:text-amber-400"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Cuenta */}
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white">
            Tu cuenta
          </h3>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>
              <Link href="/mis-numeros" className="transition hover:text-amber-400">
                Mis números
              </Link>
            </li>
            <li>
              <Link href="/mis-pagos" className="transition hover:text-amber-400">
                Mis pagos
              </Link>
            </li>
            <li>
              <Link href="/perfil" className="transition hover:text-amber-400">
                Mi perfil
              </Link>
            </li>
            <li>
              <Link href="/login" className="transition hover:text-amber-400">
                Ingresar
              </Link>
            </li>
          </ul>
        </div>

        {/* Legal */}
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white">
            Legal
          </h3>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>
              <Link href="/terminos" className="transition hover:text-amber-400">
                Términos y Condiciones
              </Link>
            </li>
            <li>
              <Link href="/privacidad" className="transition hover:text-amber-400">
                Política de Privacidad
              </Link>
            </li>
          </ul>
        </div>

        {/* Contacto */}
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white">
            Contacto
          </h3>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>
              <a
                href={whatsappHref()}
                target={whatsappHref().startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="transition hover:text-amber-400"
              >
                WhatsApp de ventas
              </a>
            </li>
            <li>
              <a
                href="mailto:francofsm84@gmail.com"
                className="transition hover:text-amber-400"
              >
                Soporte por email
              </a>
            </li>
            <li>
              <Link href="/planes" className="transition hover:text-amber-400">
                Ser organizador
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-zinc-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-zinc-500 sm:flex-row">
          <p>
            © {new Date().getFullYear()} Gadu Sorteos. Todos los derechos
            reservados.
          </p>
          <p>
            desarrollado por{" "}
            <a
              href="https://www.instagram.com/jacinto.cards"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-300 transition hover:text-amber-400"
            >
              @jacinto.cards
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
