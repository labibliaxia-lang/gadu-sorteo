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
  Wrench,
  X,
} from "lucide-react";

import { useTheme } from "next-themes";

import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/#sorteos", label: "Sorteos" },
  { href: "/mis-pagos", label: "Mis Pagos" },
];

export function Navbar() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    let active = true;

    async function refresh(u: string | null, em: string | null) {
      setUserId(u);
      setEmail(em);
      if (u) {
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", u)
          .maybeSingle();
        // Solo muestra Admin si el rol es estrictamente "admin".
        if (active) setIsAdmin(data?.role === "admin");
      } else {
        setIsAdmin(false);
      }
    }

    supabase.auth.getUser().then(({ data }) =>
      refresh(data.user?.id ?? null, data.user?.email ?? null),
    );
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      refresh(session?.user.id ?? null, session?.user.email ?? null),
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

  const initial = email?.charAt(0).toUpperCase() ?? "U";

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
                  Admin
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
              <span className="flex items-center gap-2 rounded-full border px-2 py-1 text-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                  {initial}
                </span>
                <span className="hidden max-w-[140px] truncate lg:inline">
                  {email}
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
                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                  >
                    <LayoutDashboard className="h-4 w-4" /> Admin
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
