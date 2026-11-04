"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
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

const linkClass =
  "text-[13px] text-fg-subtle transition-colors hover:text-fg";

export function Footer() {
  const pathname = usePathname();

  // El panel es una herramienta, no una página de marketing: sin footer
  // público, sin Instagram y sin legales al pie de cada acción.
  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="mt-24 border-t border-hairline bg-panel-1">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-8 gap-y-10 px-4 py-14 sm:px-6 lg:grid-cols-4">
        {/* Marca */}
        <div className="col-span-2 space-y-4 lg:col-span-1">
          <Link href="/" className="inline-flex" aria-label="Gadu Sorteos — inicio">
            <Image
              src="/logo-gadu-azul.png"
              alt="Gadu Sorteos"
              width={200}
              height={100}
              className="h-9 w-auto dark:hidden"
            />
            <Image
              src="/logo-gadu-blanco.png"
              alt=""
              aria-hidden="true"
              width={200}
              height={100}
              className="hidden h-9 w-auto dark:block"
            />
          </Link>
          <p className="max-w-xs text-[13px] leading-relaxed text-fg-subtle">
            Sorteos transparentes con premios de todo tipo. Elegí tus números,
            participá y ganá.
          </p>
          <p className="flex items-start gap-2 text-xs text-fg-subtle">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            Pago por transferencia y comprobante por WhatsApp.
          </p>
          <div className="flex gap-2 pt-1">
            <a
              href="https://www.instagram.com/jacinto.cards"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram de Gadu Sorteos"
              className="rounded-md border border-hairline p-2 text-fg-subtle transition-colors hover:border-hairline-strong hover:text-brand-accent"
            >
              <Instagram className="h-4 w-4" />
            </a>
            <a
              href={whatsappHref()}
              target={whatsappHref().startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
              aria-label="WhatsApp de Gadu Sorteos"
              className="rounded-md border border-hairline p-2 text-fg-subtle transition-colors hover:border-hairline-strong hover:text-brand-accent"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Cuenta */}
        <div>
          <h3 className="eyebrow mb-3">Tu cuenta</h3>
          <ul className="space-y-2">
            <li>
              <Link href="/mis-numeros" className={linkClass}>
                Mis números
              </Link>
            </li>
            <li>
              <Link href="/mis-pagos" className={linkClass}>
                Mis pagos
              </Link>
            </li>
            <li>
              <Link href="/perfil" className={linkClass}>
                Mi perfil
              </Link>
            </li>
            <li>
              <Link href="/login" className={linkClass}>
                Ingresar
              </Link>
            </li>
          </ul>
        </div>

        {/* Legal */}
        <div>
          <h3 className="eyebrow mb-3">Legal</h3>
          <ul className="space-y-2">
            <li>
              <Link href="/terminos" className={linkClass}>
                Términos y Condiciones
              </Link>
            </li>
            <li>
              <Link href="/privacidad" className={linkClass}>
                Política de Privacidad
              </Link>
            </li>
          </ul>
        </div>

        {/* Contacto */}
        <div>
          <h3 className="eyebrow mb-3">Contacto</h3>
          <ul className="space-y-2">
            <li>
              <Link href="/ayuda" className={linkClass}>
                Centro de ayuda
              </Link>
            </li>
            <li>
              <a
                href={whatsappHref()}
                target={whatsappHref().startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer"
                className={linkClass}
              >
                WhatsApp de ventas
              </a>
            </li>
            <li>
              <a href="mailto:francofsm84@gmail.com" className={linkClass}>
                Soporte por email
              </a>
            </li>
            <li>
              <Link href="/planes" className={linkClass}>
                Ser organizador
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 sm:flex-row sm:px-6">
          <p className="font-mono text-[12px] text-fg-subtle">
            © {new Date().getFullYear()} Gadu Sorteos. Todos los derechos
            reservados.
          </p>
          <p className="font-mono text-[12px] text-fg-subtle">
            desarrollado por{" "}
            <a
              href="https://www.instagram.com/jacinto.cards"
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg-muted transition-colors hover:text-brand-accent"
            >
              @jacinto.cards
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
