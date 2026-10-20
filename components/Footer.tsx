import Link from "next/link";
import {
  CreditCard,
  Facebook,
  Instagram,
  ShieldCheck,
  Twitter,
  Wrench,
  Youtube,
} from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-16 border-t bg-zinc-950 text-zinc-300">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        {/* Marca */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600">
              <Wrench className="h-5 w-5 text-white" />
            </span>
            <span className="font-bold">Gadu Sorteos</span>
          </div>
          <p className="text-sm text-zinc-400">
            Sorteos transparentes de herramientas para tu taller. Elegí tus
            números, participá y ganá.
          </p>
        </div>

        {/* Enlaces rápidos */}
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white">
            Enlaces
          </h3>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/" className="transition hover:text-amber-400">
                Inicio
              </Link>
            </li>
            <li>
              <Link href="/#sorteos" className="transition hover:text-amber-400">
                Sorteos
              </Link>
            </li>
            <li>
              <Link href="/mis-pagos" className="transition hover:text-amber-400">
                Mis pagos
              </Link>
            </li>
            <li>
              <Link href="/register" className="transition hover:text-amber-400">
                Crear cuenta
              </Link>
            </li>
          </ul>
        </div>

        {/* Pago seguro */}
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white">
            Pago seguro
          </h3>
          <div className="flex items-start gap-2 text-sm text-zinc-400">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span>
              Pagos procesados con Mercado Pago. Tus datos están protegidos.
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-zinc-400">
            <CreditCard className="h-4 w-4" />
            <span>Visa · Mastercard · Mercado Pago</span>
          </div>
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
          <p>Hecho con ❤️ para tu taller.</p>
        </div>
      </div>
    </footer>
  );
}
