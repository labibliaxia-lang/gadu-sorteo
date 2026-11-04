import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock, Plus, ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AdminNav } from "@/components/admin/AdminNav";
import { adminMfaRequired } from "@/lib/flags";
import { evaluateAdminMfaGate } from "@/lib/mfa";
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

  // Segundo factor. Con ADMIN_MFA_REQUIRED=true una sesión `aal1` no entra al
  // panel, aunque el rol sea correcto: el rol dice «qué puede hacer», el nivel
  // de garantía dice «cuánto demostró para entrar».
  const required = adminMfaRequired();
  const { data: assurance } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const gate = evaluateAdminMfaGate({
    required,
    currentLevel: assurance?.currentLevel,
    nextLevel: assurance?.nextLevel,
  });

  if (gate !== "ok") {
    redirect(`/seguridad?next=${encodeURIComponent("/admin")}`);
  }

  // Con el flag apagado igual se ofrece el paso: es la única forma de que los
  // organizadores se enteren de que existe antes de exigirlo.
  const showMfaNudge = assurance?.currentLevel !== "aal2";

  return (
    <div className="space-y-8">
      <header className="space-y-5 border-b border-hairline pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="eyebrow">Panel del organizador</p>
            <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-[-0.02em]">
              Panel de organizador
            </h1>
            <p className="text-[13px] text-fg-subtle">
              Gestioná sorteos, premios y sorteá ganadores.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {profile?.role === "superadmin" && (
              <form action={lockAdminSession}>
                <button
                  type="submit"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Lock className="mr-1.5 h-4 w-4" />
                  Bloquear panel
                </button>
              </form>
            )}
            <Link
              href="/admin/sorteos/nuevo"
              className={cn(buttonVariants(), "w-full sm:w-auto")}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Nuevo sorteo
            </Link>
          </div>
        </div>

        <AdminNav role={profile?.role === "superadmin" ? "superadmin" : "admin"} />
      </header>

      {showMfaNudge && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-panel-1 p-3">
          <p className="flex items-start gap-2 text-[13px] text-fg-subtle">
            <ShieldCheck
              className="mt-0.5 h-4 w-4 shrink-0 text-brand-accent"
              aria-hidden="true"
            />
            <span>
              Tu cuenta entra al panel sin segundo factor. Activá el código de
              la app autenticadora para que una sesión robada no alcance.
            </span>
          </p>
          <Link
            href="/seguridad"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Activarlo
          </Link>
        </div>
      )}

      {children}
    </div>
  );
}
