import { notFound } from "next/navigation";

import { requireAdminSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  NotificationsPanel,
  type NotificationItem,
} from "@/components/admin/NotificationsPanel";

export const dynamic = "force-dynamic";

/**
 * Bandeja de decisiones del organizador (spec:
 * 02-DOCS/wiki/ftd/notificaciones-organizador.md). RLS limita las filas a las
 * del usuario logueado; el superadmin ve todas.
 */
export default async function NotificacionesPage() {
  const actor = await requireAdminSession();
  if (!actor) notFound();

  const supabase = createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, raffle_id, payload, status, created_at, expires_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const inicial = (data ?? []) as NotificationItem[];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Panel del organizador</p>
        <h1 className="text-2xl font-bold tracking-tight">Avisos</h1>
        <p className="text-sm text-fg-subtle">
          Cada aviso es una decisión: aprobar la reserva al ver el comprobante,
          liberarla si no pagó, o darle más tiempo.
        </p>
      </header>

      <NotificationsPanel inicial={inicial} />
    </div>
  );
}
