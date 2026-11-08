import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireSuperadminSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { blockerMessages } from "@/lib/account-deletion";
import { BajasList, type BajaItem } from "./BajasList";

export const dynamic = "force-dynamic";

/**
 * Solicitudes de baja de cuenta. Aprobar ejecuta el borrado: valida los cuatro
 * bloqueos, purga los documentos KYC y elimina la cuenta. Los pagos quedan
 * registrados sin dueño (migración 0082).
 */
export default async function BajasPage() {
  const session = await requireSuperadminSession();
  if (!session) notFound();

  const admin = createAdminClient();

  const { data: solicitudes } = await admin
    .from("account_deletion_requests")
    .select("id, user_id, reason, requested_at")
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  const filas = solicitudes ?? [];
  const ids = filas.map((f) => f.user_id);

  const perfiles = ids.length
    ? ((await admin.from("profiles").select("id, full_name, email").in("id", ids))
        .data ?? [])
    : [];

  const porId = new Map(perfiles.map((p) => [p.id, p]));

  const items: BajaItem[] = [];
  for (const fila of filas) {
    const { data: bloqueos } = await admin.rpc("account_deletion_blockers", {
      p_user: fila.user_id,
    });

    const perfil = porId.get(fila.user_id);
    items.push({
      id: fila.id,
      nombre: perfil?.full_name ?? "Sin nombre",
      email: perfil?.email ?? null,
      requestedAt: fila.requested_at,
      reason: fila.reason,
      blockers: blockerMessages((bloqueos ?? []) as string[]),
    });
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/super"
        className="inline-flex items-center gap-1.5 text-sm text-fg-subtle underline-offset-4 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver al panel
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Bajas de cuenta</h1>
        <p className="text-sm text-fg-subtle">
          El usuario pide la baja desde su perfil. Acá se aprueba o se rechaza con
          un motivo. Aprobar borra datos personales y documentos KYC; los pagos y
          devoluciones quedan registrados sin nombre.
        </p>
      </header>

      <BajasList items={items} />
    </div>
  );
}
