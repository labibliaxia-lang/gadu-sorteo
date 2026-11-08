"use client";

import Image from "next/image";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Instagram, MessageCircle, ShieldCheck } from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";

/** Número público de ventas; si falta, el bloque enlaza a /planes. */
function whatsappHref(message: string): string {
  const phone = (process.env.NEXT_PUBLIC_SALES_WHATSAPP ?? "").replace(/\D/g, "");
  if (!phone) return "/planes";
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

const linkClass =
  "text-[13px] text-fg-subtle transition-colors hover:text-fg";

export function Footer() {
  const t = useTranslations("Footer");
  const pathname = usePathname();
  const salesHref = whatsappHref(t("whatsappMessage"));

  // El panel es una herramienta, no una página de marketing: sin footer
  // público, sin Instagram y sin legales al pie de cada acción.
  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="mt-24 border-t border-hairline bg-panel-1">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-8 gap-y-10 px-4 py-14 sm:px-6 lg:grid-cols-4">
        {/* Marca */}
        <div className="col-span-2 space-y-4 lg:col-span-1">
          <LocaleLink
            href="/"
            className="inline-flex"
            aria-label="Gadu Sorteos"
          >
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
          </LocaleLink>
          <p className="max-w-xs text-[13px] leading-relaxed text-fg-subtle">
            {t("tagline")}
          </p>
          <p className="flex items-start gap-2 text-xs text-fg-subtle">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            {t("paymentNote")}
          </p>
          <div className="flex gap-2 pt-1">
            <a
              href="https://www.instagram.com/jacinto.cards"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("instagramLabel")}
              className="rounded-md border border-hairline p-2 text-fg-subtle transition-colors hover:border-hairline-strong hover:text-brand-accent"
            >
              <Instagram className="h-4 w-4" />
            </a>
            <a
              href={salesHref}
              target={salesHref.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
              aria-label={t("whatsappLabel")}
              className="rounded-md border border-hairline p-2 text-fg-subtle transition-colors hover:border-hairline-strong hover:text-brand-accent"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Cuenta */}
        <div>
          <h3 className="eyebrow mb-3">{t("account")}</h3>
          <ul className="space-y-2">
            <li>
              <NextLink href="/mis-numeros" className={linkClass}>
                {t("myNumbers")}
              </NextLink>
            </li>
            <li>
              <NextLink href="/mis-pagos" className={linkClass}>
                {t("myPayments")}
              </NextLink>
            </li>
            <li>
              <NextLink href="/perfil" className={linkClass}>
                {t("myProfile")}
              </NextLink>
            </li>
            <li>
              <NextLink href="/login" className={linkClass}>
                {t("login")}
              </NextLink>
            </li>
          </ul>
        </div>

        {/* Legal */}
        <div>
          <h3 className="eyebrow mb-3">{t("legal")}</h3>
          <ul className="space-y-2">
            <li>
              <NextLink href="/terminos" className={linkClass}>
                {t("terms")}
              </NextLink>
            </li>
            <li>
              <NextLink href="/privacidad" className={linkClass}>
                {t("privacy")}
              </NextLink>
            </li>
          </ul>
        </div>

        {/* Contacto */}
        <div>
          <h3 className="eyebrow mb-3">{t("contact")}</h3>
          <ul className="space-y-2">
            <li>
              <NextLink href="/ayuda" className={linkClass}>
                {t("help")}
              </NextLink>
            </li>
            <li>
              <a
                href={salesHref}
                target={salesHref.startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer"
                className={linkClass}
              >
                {t("salesWhatsapp")}
              </a>
            </li>
            <li>
              <a href="mailto:francofsm84@gmail.com" className={linkClass}>
                {t("emailSupport")}
              </a>
            </li>
            <li>
              <LocaleLink href="/planes" className={linkClass}>
                {t("becomeOrganizer")}
              </LocaleLink>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 sm:flex-row sm:px-6">
          <p className="font-mono text-[12px] text-fg-subtle">
            {t("rights", { year: new Date().getFullYear() })}
          </p>
          <p className="font-mono text-[12px] text-fg-subtle">
            {t("developedBy")}{" "}
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
