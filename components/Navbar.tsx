"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/lib/types";

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
                <Button variant="ghost" asChild>
                  <Link href="/admin/sorteos">Admin</Link>
                </Button>
              )}
              <Button variant="ghost" asChild>
                <Link href="/mis-pagos">Mis pagos</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={signOut}>
                Cerrar sesión
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/login">Ingresar</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/register">Registrarse</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
