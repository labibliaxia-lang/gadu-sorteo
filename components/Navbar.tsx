"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Receipt,
  Sun,
  Ticket,
  User,
  X,
} from "lucide-react";

import { useTheme } from "next-themes";
import type { Session } from "@supabase/supabase-js";

import {
  Link as LocaleLink,
  usePathname as useLocalePathname,
  useRouter as useLocaleRouter,
} from "@/src/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { RequestAdminButton } from "@/components/RequestAdminButton";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", key: "home" },
  { href: "/#sorteos", key: "raffles" },
  { href: "/ganadores", key: "winners" },
  { href: "/como-funciona", key: "howItWorks" },
  { href: "/planes", key: "plans" },
] as const;

const LOCALES = [
  { code: "es", key: "localeEs" },
  { code: "en", key: "localeEn" },
  { code: "pt", key: "localePt" },
] as const;

const LOCALIZED_ROOTS = [
  "/sorteos",
  "/como-funciona",
  "/ganadores",
  "/planes",
  "/login",
  "/register",
  "/terminos",
  "/privacidad",
];

/** Solo las rutas migradas tienen versión en otro idioma. */
function supportsLocale(pathname: string): boolean {
  if (pathname === "/") return true;
  return LOCALIZED_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

type InitialUser = {
  id: string;
  email: string | null;
  avatarUrl: string | null;
} | null;

export function Navbar({ initialUser }: { initialUser?: InitialUser }) {
  const t = useTranslations("Navbar");
  const locale = useLocale();
  const router = useLocaleRouter();
  const pathname = usePathname();
  const localePathname = useLocalePathname();
  const inPanel = pathname.startsWith("/admin");
  const showLocaleSwitcher = !inPanel && supportsLocale(localePathname);
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(initialUser?.id ?? null);
  const [email, setEmail] = useState<string | null>(initialUser?.email ?? null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleRequested, setRoleRequested] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    initialUser?.avatarUrl ?? null,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    let active = true;

    async function applySession(session: Session | null) {
      const u = session?.user ?? null;

      // Actualiza la identidad de inmediato para ocultar los botones de
      // invitado en cuanto exista sesión (sin depender de la red).
      if (!active) return;
      setUserId(u?.id ?? null);
      setEmail(u?.email ?? null);

      if (!u) {
        setIsAdmin(false);
        setRoleRequested(false);
        setDisplayName(null);
        setAvatarUrl(null);
        return;
      }

      const providerAvatar =
        (u.user_metadata as { avatar_url?: string } | undefined)?.avatar_url ??
        null;

      const { data } = await supabase
        .from("profiles")
        .select("role, role_requested, full_name, avatar_url")
        .eq("id", u.id)
        .maybeSingle();

      if (active) {
        // Admin (organizador) o superadmin ven el acceso al panel.
        setIsAdmin(data?.role === "admin" || data?.role === "superadmin");
        setRoleRequested(Boolean(data?.role_requested));
        setDisplayName(data?.full_name || u.email || null);
        setAvatarUrl(data?.avatar_url || providerAvatar || null);
      }
    }

    // Estado inicial: lee la sesión desde las cookies (local, sin red), para
    // que una llamada de red lenta o fallida no pise el estado correcto.
    supabase.auth.getSession().then(({ data }) => applySession(data.session));

    // Reactividad: login, logout y refresco de token actualizan la UI al instante.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      applySession(session),
    );

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  // Evita mismatch de hidratación en el ícono de tema.
  useEffect(() => {
    setMounted(true);
  }, []);

  function toggleTheme() {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const initial = (displayName || email || "U").charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-canvas/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-6 sm:px-6">
        {/* Logo */}
        <LocaleLink
          href="/"
          className="flex shrink-0 items-center"
          aria-label={t("logoHome")}
        >
          <Image
            src="/logo-gadu-azul.png"
            alt="Gadu Sorteos"
            width={200}
            height={100}
            className="h-10 w-auto dark:hidden"
            priority
          />
          <Image
            src="/logo-gadu-blanco.png"
            alt=""
            aria-hidden="true"
            width={200}
            height={100}
            className="hidden h-10 w-auto dark:block"
            priority
          />
        </LocaleLink>

        {/* Navegación desktop (oculta dentro del panel) */}
        <nav
          className={
            inPanel
              ? "hidden"
              : "hidden min-w-0 items-center gap-1 xl:flex"
          }
        >
          {NAV_LINKS.map((l) => (
            <LocaleLink
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-[13px] font-medium text-fg-subtle transition-colors hover:bg-panel-2 hover:text-fg"
            >
              {t(l.key)}
            </LocaleLink>
          ))}
        </nav>

        {/* Área de usuario desktop */}
        <div className="hidden shrink-0 items-center gap-2 xl:flex">
          {userId ? (
            <>
              {isAdmin && (
                <NextLink
                  href="/admin"
                  title={t("organizerPanel")}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  <LayoutDashboard className="h-4 w-4 2xl:mr-1.5" />
                  <span className="hidden 2xl:inline">{t("organizer")}</span>
                </NextLink>
              )}
              <NextLink
                href="/mis-pagos"
                title={t("myPayments")}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <Receipt className="h-4 w-4 2xl:mr-1.5" />
                <span className="hidden 2xl:inline">{t("myPayments")}</span>
              </NextLink>
              <NextLink
                href="/mis-numeros"
                title={t("myNumbers")}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <Ticket className="h-4 w-4 2xl:mr-1.5" />
                <span className="hidden 2xl:inline">{t("myNumbers")}</span>
              </NextLink>
              <NextLink
                href="/perfil"
                title={t("myProfile")}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <User className="h-4 w-4 2xl:mr-1.5" />
                <span className="hidden 2xl:inline">{t("profile")}</span>
              </NextLink>
              {!isAdmin && !roleRequested && <RequestAdminButton />}
              <span className="flex items-center gap-2 rounded-md border border-hairline px-2 py-1 text-[13px] text-fg-muted">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt={displayName ?? t("user")}
                    referrerPolicy="no-referrer"
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                    {initial}
                  </span>
                )}
                <span className="hidden max-w-[140px] truncate 2xl:inline">
                  {displayName || email}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                title={t("logoutLong")}
              >
                <LogOut className="h-4 w-4 2xl:mr-1.5" />
                <span className="hidden 2xl:inline">{t("logout")}</span>
              </Button>
            </>
          ) : (
            <>
              <LocaleLink
                href="/login"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                {t("login")}
              </LocaleLink>
              <LocaleLink
                href="/register"
                className={buttonVariants({ size: "sm" })}
              >
                {t("register")}
              </LocaleLink>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {showLocaleSwitcher && (
            <div
              className="hidden items-center gap-0.5 rounded-md border border-hairline p-0.5 sm:flex"
              role="group"
              aria-label={t("language")}
            >
              {LOCALES.map((item) => (
                <LocaleLink
                  key={item.code}
                  href={localePathname}
                  locale={item.code}
                  aria-current={locale === item.code ? "true" : undefined}
                  className={cn(
                    "rounded px-1.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors",
                    locale === item.code
                      ? "bg-panel-3 text-fg"
                      : "text-fg-subtle hover:text-fg",
                  )}
                >
                  {item.code}
                </LocaleLink>
              ))}
            </div>
          )}
          <NotificationBell userId={userId} />
          {!userId && (
            <LocaleLink
              href="/login"
              className="rounded-md px-2 py-2 text-[13px] font-medium text-fg-muted transition-colors hover:bg-panel-2 hover:text-fg xl:hidden"
            >
              {t("login")}
            </LocaleLink>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={t("theme")}
            className="rounded-md p-2 text-fg-subtle transition-colors hover:bg-panel-2 hover:text-fg"
          >
            {mounted && resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>

          {/* Toggle móvil / tablet */}
          <button
            type="button"
            className="rounded-md p-2 text-fg-muted transition-colors hover:bg-panel-2 hover:text-fg xl:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? t("closeMenu") : t("openMenu")}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Menú móvil / tablet */}
      {mobileOpen && (
        <div className="max-h-[calc(100vh-3.5rem)] overflow-y-auto border-t border-hairline bg-canvas xl:hidden">
          <nav className="flex flex-col gap-1 p-4">
            {!inPanel &&
              NAV_LINKS.map((l) => (
                <LocaleLink
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium text-fg-muted hover:bg-panel-2 hover:text-fg"
                >
                  {t(l.key)}
                </LocaleLink>
              ))}

            {showLocaleSwitcher && (
              <div
                className="mt-2 flex items-center gap-1 rounded-md border border-hairline p-1"
                role="group"
                aria-label={t("language")}
              >
                {LOCALES.map((item) => (
                  <LocaleLink
                    key={item.code}
                    href={localePathname}
                    locale={item.code}
                    onClick={() => setMobileOpen(false)}
                    aria-current={locale === item.code ? "true" : undefined}
                    className={cn(
                      "flex-1 rounded px-2 py-1.5 text-center font-mono text-[11px] uppercase tracking-[0.06em]",
                      locale === item.code
                        ? "bg-panel-3 text-fg"
                        : "text-fg-subtle hover:text-fg",
                    )}
                  >
                    {t(item.key)}
                  </LocaleLink>
                ))}
              </div>
            )}

            <div className="my-2 border-t border-hairline" />

            {userId ? (
              <>
                <div className="mb-2 flex items-center gap-3 rounded-lg bg-panel-1 p-3">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt={displayName ?? t("user")}
                      referrerPolicy="no-referrer"
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
                      {initial}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {displayName || email}
                    </p>
                    {email && (
                      <p className="truncate text-xs text-fg-subtle">{email}</p>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <NextLink
                    href="/admin"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-fg-muted hover:bg-panel-2 hover:text-fg"
                  >
                    <LayoutDashboard className="h-4 w-4" /> {t("organizer")}
                  </NextLink>
                )}
                <NextLink
                  href="/mis-pagos"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-fg-muted hover:bg-panel-2 hover:text-fg"
                >
                  <Receipt className="h-4 w-4" /> {t("myPayments")}
                </NextLink>
                <NextLink
                  href="/mis-numeros"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-fg-muted hover:bg-panel-2 hover:text-fg"
                >
                  <Ticket className="h-4 w-4" /> {t("myNumbers")}
                </NextLink>
                <NextLink
                  href="/perfil"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-fg-muted hover:bg-panel-2 hover:text-fg"
                >
                  <User className="h-4 w-4" /> {t("profile")}
                </NextLink>
                {!isAdmin && !roleRequested && <RequestAdminButton />}
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    signOut();
                  }}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-destructive hover:bg-panel-2"
                >
                  <LogOut className="h-4 w-4" /> {t("logoutLong")}
                </button>
              </>
            ) : (
              <>
                <LocaleLink
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium text-fg-muted hover:bg-panel-2 hover:text-fg"
                >
                  {t("login")}
                </LocaleLink>
                <LocaleLink
                  href="/register"
                  onClick={() => setMobileOpen(false)}
                  className={cn(buttonVariants(), "mt-1")}
                >
                  {t("register")}
                </LocaleLink>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
