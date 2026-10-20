import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, LayoutDashboard, Plus, Ticket, User } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";

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
    .select("role")
    .eq("id", user.id)
    .single();

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

        <nav className="flex gap-2 border-b pb-1">
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
        </nav>
      </header>

      {children}
    </div>
  );
}
