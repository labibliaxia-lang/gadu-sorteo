import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Crown,
  LayoutDashboard,
  Lock,
  Plus,
  ShieldCheck,
  Ticket,
  User,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { lockAdminSession } from "@/app/admin/verify/actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_banned")
    .eq("id", user.id)
    .single();

  if (profile?.is_banned) redirect("/");
  if (profile?.role !== "admin" && profile?.role !== "superadmin") redirect("/");

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Panel de Organizador
            </h1>
            <p className="text-sm text-muted-foreground">
              Gestioná sorteos, premios y sorteá ganadores.
            </p>
          </div>
          <Link
            href="/admin/sorteos/nuevo"
            className={buttonVariants({ size: "sm" })}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo sorteo
          </Link>
        </div>

        <nav className="-mx-4 flex gap-2 overflow-x-auto border-b px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/admin/sorteos"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <Ticket className="h-4 w-4" />
            Sorteos
          </Link>
          {profile?.role === "admin" && (
            <Link
              href="/admin/verificacion"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <ShieldCheck className="h-4 w-4" />
              Verificación
            </Link>
          )}
          {profile?.role === "superadmin" && (
            <Link
              href="/admin/super"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <Crown className="h-4 w-4" />
              Super
            </Link>
          )}
          <Link
            href="/admin/perfil"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <User className="h-4 w-4" />
            Perfil
          </Link>

          {/* El bloqueo del panel es del segundo factor, exclusivo del
              superadmin: un organizador común nunca abrió la cookie maestra. */}
          {profile?.role === "superadmin" && (
            <form action={lockAdminSession} className="ml-auto">
              <button
                type="submit"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Lock className="mr-1.5 h-4 w-4" />
                Bloquear panel
              </button>
            </form>
          )}
        </nav>
      </header>

      {children}
    </div>
  );
}
