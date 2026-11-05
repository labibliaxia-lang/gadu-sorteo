import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MfaPanel } from "@/components/security/MfaPanel";
import { PasskeysPanel } from "@/components/security/PasskeysPanel";
import { buttonVariants } from "@/components/ui/button";
import { adminMfaRequired } from "@/lib/flags";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Seguridad de la cuenta | Gadu Sorteos",
  description: "Segundo factor y llaves de acceso de tu cuenta.",
  robots: { index: false, follow: false },
};

/**
 * Seguridad de la cuenta: segundo factor (TOTP) y llaves de acceso.
 *
 * Vive fuera de `app/admin/*` a propósito. El layout del panel exige `aal2`
 * cuando `ADMIN_MFA_REQUIRED=true`; si esta pantalla estuviera adentro, el
 * usuario sin factor quedaría encerrado en un bucle de redirecciones.
 */
export default async function SeguridadPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/seguridad")}`);
  }

  const [{ data: assurance }, { data: factors }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);

  const totpFactors = (factors?.totp ?? []).map((factor) => ({
    id: factor.id,
    friendlyName: factor.friendly_name ?? null,
    verified: factor.status === "verified",
  }));

  // Solo se acepta un destino interno del panel.
  const rawNext = searchParams.next ?? "";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Seguridad</h1>
        <p className="text-muted-foreground">
          Protegé tu cuenta con un segundo factor y llaves de acceso.
        </p>
      </header>

      <MfaPanel
        factors={totpFactors}
        currentLevel={assurance?.currentLevel ?? null}
        required={adminMfaRequired()}
      />

      <PasskeysPanel />

      <div className="flex flex-wrap gap-3">
        {next && (
          <Link href={next} className={buttonVariants()}>
            Volver al panel
          </Link>
        )}
        <Link
          href="/perfil"
          className={buttonVariants({ variant: "outline" })}
        >
          Ir a mi perfil
        </Link>
      </div>
    </div>
  );
}
