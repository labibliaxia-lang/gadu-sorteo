import Link from "next/link";
import Image from "next/image";
import {
  CreditCard,
  Facebook,
  Instagram,
  ShieldCheck,
  Twitter,
  Youtube,
} from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-16 border-t bg-zinc-950 text-zinc-300">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        {/* Marca */}
        <div className="space-y-3">
          <div className="flex items-center">
            <span className="rounded-lg bg-white px-2 py-1.5 ring-1 ring-white/10">
              <Image
                src="/logo-gadu-wordmark.png"
                alt="Gadu Sorteos"
                width={112}
                height={44}
                className="h-7 w-auto"
              />
            </span>
          </div>
          <p className="text-sm text-zinc-400">
            Sorteos transparentes con premios de todo tipo. Elegí tus números,
            participá y ganá.
          </p>
        </div>

        {/* Pago seguro */}
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white">
            Pago por transferencia
          </h3>
          <div className="flex items-start gap-2 text-sm text-zinc-400">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span>
              Transferí y enviá el comprobante por WhatsApp. El organizador
              valida tu pago.
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-zinc-400">
            <CreditCard className="h-4 w-4" />
            <span>Transferencia bancaria · Comprobante por WhatsApp</span>
          </div>
        </div>

        {/* Información */}
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white">
            Información
          </h3>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>
              <Link
                href="/como-funciona"
                className="transition hover:text-amber-400"
              >
                Cómo funciona
              </Link>
            </li>
            <li>
              <Link
                href="/ganadores"
                className="transition hover:text-amber-400"
              >
                Muro de Ganadores
              </Link>
            </li>
            <li>
              <Link href="/terminos" className="transition hover:text-amber-400">
                Términos y Condiciones
              </Link>
            </li>
            <li>
              <Link
                href="/privacidad"
                className="transition hover:text-amber-400"
              >
                Política de Privacidad
              </Link>
            </li>
            <li>
              <Link href="/planes" className="transition hover:text-amber-400">
                Planes y precios
              </Link>
            </li>
          </ul>
        </div>

        {/* Redes sociales */}
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white">
            Seguinos
          </h3>
          <div className="flex gap-3">
            <a
              href="#"
              aria-label="Instagram"
              className="rounded-lg border border-zinc-800 p-2 transition hover:border-amber-400 hover:text-amber-400"
            >
              <Instagram className="h-5 w-5" />
            </a>
            <a
              href="#"
              aria-label="Facebook"
              className="rounded-lg border border-zinc-800 p-2 transition hover:border-amber-400 hover:text-amber-400"
            >
              <Facebook className="h-5 w-5" />
            </a>
            <a
              href="#"
              aria-label="Twitter"
              className="rounded-lg border border-zinc-800 p-2 transition hover:border-amber-400 hover:text-amber-400"
            >
              <Twitter className="h-5 w-5" />
            </a>
            <a
              href="#"
              aria-label="YouTube"
              className="rounded-lg border border-zinc-800 p-2 transition hover:border-amber-400 hover:text-amber-400"
            >
              <Youtube className="h-5 w-5" />
            </a>
          </div>
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
