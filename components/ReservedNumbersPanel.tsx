"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MessageCircle } from "lucide-react";

import { markReservationPaid } from "@/app/admin/sorteos/[id]/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { waLink } from "@/lib/superadmin";
import { cn, formatDateTime, formatPrice } from "@/lib/utils";

export interface ReservedGroup {
  userId: string;
  name: string;
  phone: string | null;
  numbers: number[];
  expiresAt: string | null;
}

interface ReservedNumbersPanelProps {
  raffleId: string;
  pricePerNumber: number;
  groups: ReservedGroup[];
}

/**
 * Reservas del prepago manual: el comprador mandó (o va a mandar) el
 * comprobante por WhatsApp y el organizador confirma el pago desde acá.
 */
export function ReservedNumbersPanel({
  raffleId,
  pricePerNumber,
  groups,
}: ReservedNumbersPanelProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function markPaid(group: ReservedGroup) {
    setBusyId(group.userId);
    setError(null);
    setMessage(null);

    const result = await markReservationPaid(raffleId, group.numbers);

    if (!result.ok) {
      setError(result.error);
    } else {
      setMessage(
        `${result.count} número(s) marcados como pagados para ${group.name}.`,
      );
      router.refresh();
    }

    setBusyId(null);
  }

  async function markAllPaid() {
    const all = Array.from(new Set(groups.flatMap((g) => g.numbers)));

    if (
      !window.confirm(
        `¿Marcar ${all.length} número(s) reservados como pagados? Esta acción no se puede deshacer desde el panel.`,
      )
    ) {
      return;
    }

    setBusyId("all");
    setError(null);
    setMessage(null);

    const result = await markReservationPaid(raffleId, all);

    if (!result.ok) {
      setError(result.error);
    } else {
      setMessage(`${result.count} número(s) marcados como pagados.`);
      router.refresh();
    }

    setBusyId(null);
  }

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay números reservados esperando confirmación. Cuando alguien
        reserve desde la página del sorteo, aparece acá.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {message && (
        <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          {message}
        </p>
      )}

      <ul className="space-y-3">
        {groups.map((group) => {
          const total = group.numbers.length * pricePerNumber;
          const chat = waLink(group.phone);
          const busy = busyId !== null;

          return (
            <li
              key={group.userId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">{group.name}</p>
                <p className="text-xs text-muted-foreground">
                  {group.numbers.length} número
                  {group.numbers.length === 1 ? "" : "s"} ·{" "}
                  {formatPrice(total)}
                  {group.expiresAt &&
                    ` · reserva hasta ${formatDateTime(group.expiresAt)}`}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {group.numbers.map((n) => (
                    <span
                      key={n}
                      className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs"
                    >
                      {n}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {group.phone && (
                  <a
                    href={chat ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={!chat}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      !chat && "pointer-events-none opacity-50",
                    )}
                  >
                    <MessageCircle className="mr-1.5 h-4 w-4" />
                    WhatsApp
                  </a>
                )}

                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={busy}
                  onClick={() => markPaid(group)}
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  {busyId === group.userId
                    ? "Marcando…"
                    : "Marcar como Pagado"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {groups.length > 1 && (
        <Button
          variant="outline"
          size="sm"
          disabled={busyId !== null}
          onClick={markAllPaid}
        >
          {busyId === "all"
            ? "Marcando…"
            : "Marcar todas como pagadas"}
        </Button>
      )}
    </div>
  );
}
