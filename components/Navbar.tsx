"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Receipt,
  Sun,
  Ticket,
  User,
  Wrench,
  X,
} from "lucide-react";

import { useTheme } from "next-themes";
import type { Session } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { RequestAdminButton } from "@/components/RequestAdminButton";

const NAV_LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/#sorteos", label: "Sorteos" },
  { href: "/mis-pagos", label: "Mis Pagos" },
];

type InitialUser = {
  id: string;
  email: string | null;
  avatarUrl: string | null;
} | null;

export function Navbar({ initialUser }: { initialUser?: InitialUser }) {
  const router = useRouter();
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
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
            <Wrench className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold tracking-tight">
            Gadu <span className="text-amber-600">Sorteos</span>
          </span>
        </Link>

        {/* Navegación desktop */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Área de usuario desktop */}
        <div className="hidden items-center gap-2 md:flex">
          {userId ? (
            <>
              {isAdmin && (
                <Link
                  href="/admin"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  <LayoutDashboard className="mr-1.5 h-4 w-4" />
                  Organizador
                </Link>
              )}
              <Link
                href="/mis-pagos"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <Receipt className="mr-1.5 h-4 w-4" />
                Mis pagos
              </Link>
              <Link
                href="/mis-numeros"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <Ticket className="mr-1.5 h-4 w-4" />
                Mis números
              </Link>
              <Link
                href="/perfil"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <User className="mr-1.5 h-4 w-4" />
                Perfil
              </Link>
              {!isAdmin && !roleRequested && <RequestAdminButton />}
              <span className="flex items-center gap-2 rounded-full border px-2 py-1 text-sm">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt={displayName ?? "Usuario"}
                    referrerPolicy="no-referrer"
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                    {initial}
                  </span>
                )}
                <span className="hidden max-w-[140px] truncate lg:inline">
                  {displayName || email}
                </span>
              </span>
              <Button variant="outline" size="sm" onClick={signOut}>
                <LogOut className="mr-1.5 h-4 w-4" />
                Salir
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Ingresar
              </Link>
              <Link href="/register" className={buttonVariants({ size: "sm" })}>
                Registrarse
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Cambiar tema"
          className="rounded-md p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          {mounted && resolvedTheme === "dark" ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>

        {/* Toggle móvil */}
        <button
          type="button"
          className="md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Abrir menú"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Menú móvil */}
      {mobileOpen && (
        <div className="border-t md:hidden">
          <nav className="flex flex-col gap-1 p-4">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                {l.label}
              </Link>
            ))}

            <div className="my-2 border-t" />

            {userId ? (
              <>
                <div className="mb-2 flex items-center gap-3 rounded-lg bg-accent/50 p-3">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt={displayName ?? "Usuario"}
                      referrerPolicy="no-referrer"
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-lg font-bold text-white">
                      {initial}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {displayName || email}
                    </p>
                    {email && (
                      <p className="truncate text-xs text-muted-foreground">
                        {email}
                      </p>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                  >
                    <LayoutDashboard className="h-4 w-4" /> Organizador
                  </Link>
                )}
                <Link
                  href="/mis-pagos"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  <Receipt className="h-4 w-4" /> Mis pagos
                </Link>
                <Link
                  href="/mis-numeros"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  <Ticket className="h-4 w-4" /> Mis números
                </Link>
                <Link
                  href="/perfil"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  <User className="h-4 w-4" /> Perfil
                </Link>
                {!isAdmin && !roleRequested && <RequestAdminButton />}
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    signOut();
                  }}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-destructive hover:bg-accent"
                >
                  <LogOut className="h-4 w-4" /> Cerrar sesión
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  Ingresar
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  Registrarse
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
