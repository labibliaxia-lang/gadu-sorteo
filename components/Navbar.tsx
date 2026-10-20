"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";

export function Navbar() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;

    async function refresh(u: string | null) {
      setUserId(u);
      if (u) {
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", u)
          .maybeSingle();
        // Solo se muestra el botón Admin si el rol es ESTRICTAMENTE 'admin'.
        if (active) setIsAdmin(data?.role === "admin");
      } else {
        setIsAdmin(false);
      }
    }

    supabase.auth.getUser().then(({ data }) => refresh(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      refresh(session?.user.id ?? null),
    );

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold">
          🛠️ Sorteo de Herramientas
        </Link>

        <nav className="flex items-center gap-2">
          {userId ? (
            <>
              {isAdmin && (
                <Link
                  href="/admin/sorteos"
                  className={buttonVariants({ variant: "ghost" })}
                >
                  Admin
                </Link>
              )}
              <Link
                href="/mis-pagos"
                className={buttonVariants({ variant: "ghost" })}
              >
                Mis pagos
              </Link>
              <Button variant="outline" size="sm" onClick={signOut}>
                Cerrar sesión
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={buttonVariants({ variant: "ghost" })}
              >
                Ingresar
              </Link>
              <Link
                href="/register"
                className={buttonVariants({ size: "sm" })}
              >
                Registrarse
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
