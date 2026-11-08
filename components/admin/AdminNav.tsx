"use client";

import { useTranslations } from "next-intl";
import {
  Crown,
  LayoutDashboard,
  ShieldCheck,
  Star,
  Ticket,
  User,
} from "lucide-react";

import {
  Link as LocaleLink,
  usePathname,
} from "@/src/i18n/navigation";
import { cn } from "@/lib/utils";

type AdminRole = "admin" | "superadmin" | undefined;

/**
 * Navegación del panel: tabs con indicador de subrayado, no píldoras.
 * El estado activo se calcula con el pathname para que se vea dónde está
 * parado el organizador sin adivinar.
 */
export function AdminNav({ role }: { role: AdminRole }) {
  const t = useTranslations("AdminNav");
  const pathname = usePathname();

  const items = [
    { href: "/admin", labelKey: "dashboard", icon: LayoutDashboard },
    { href: "/admin/sorteos", labelKey: "raffles", icon: Ticket },
    { href: "/admin/resenas", labelKey: "reviews", icon: Star },
    ...(role === "admin"
      ? [
          {
            href: "/admin/verificacion",
            labelKey: "verification",
            icon: ShieldCheck,
          },
        ]
      : []),
    ...(role === "superadmin"
      ? [{ href: "/admin/super", labelKey: "super", icon: Crown }]
      : []),
    { href: "/admin/perfil", labelKey: "profile", icon: User },
  ];

  return (
    <nav
      aria-label={t("aria")}
      className="-mx-4 flex flex-wrap gap-0 border-b border-hairline px-4 [scrollbar-width:none] sm:mx-0 sm:flex-nowrap sm:overflow-x-auto sm:px-0"
    >
      {items.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
        return (
          <LocaleLink
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
              active
                ? "border-brand-500 text-fg"
                : "border-transparent text-fg-subtle hover:text-fg",
            )}
          >
            <item.icon className="h-4 w-4" aria-hidden="true" />
            {t(item.labelKey)}
          </LocaleLink>
        );
      })}
    </nav>
  );
}
