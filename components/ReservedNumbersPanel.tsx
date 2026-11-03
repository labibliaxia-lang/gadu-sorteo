"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  MessageCircle,
  Search,
  Undo2,
} from "lucide-react";

import {
  markReservationPaid,
  undoMarkReservationPaid,
} from "@/app/admin/sorteos/[id]/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface LastAction {
  numbers: number[];
  name: string;
}

const UNDO_SECONDS = 10 * 60;

/**
 * Reservas del prepago manual. Para marcar un pago hay que confirmar que el
 * comprobante fue recibido, se puede dejar una nota interna (auditoría) y hay
 * una ventana de 10 minutos para deshacer.
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
  const [query, setQuery] = useState("");
  const [verified, setVerified] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [undoLeft, setUndoLeft] = useState(0);

  useEffect(() => {
    if (!lastAction) return;

    setUndoLeft(UNDO_SECONDS);

    const interval = setInterval(() => {
      setUndoLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    const timeout = setTimeout(() => setLastAction(null), UNDO_SECONDS * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [lastAction]);

  const q = query.trim().toLowerCase();
  const filtered = groups.filter((group) => {
    if (!q) return true;
    if (group.name.toLowerCase().includes(q)) return true;
    if ((group.phone ?? "").replace(/\D/g, "").includes(q)) return true;
    return group.numbers.some((n) => String(n).includes(q));
  });

  function toggleVerified(userId: string) {
    setVerified((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function runMarkPaid(numbers: number[], name: string, note?: string) {
    const result = await markReservationPaid(raffleId, numbers, note);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMessage(
      `${result.count} número(s) marcados como pagados para ${name}.`,
    );
    setLastAction({ numbers, name });
    router.refresh();
  }

  async function markPaid(group: ReservedGroup) {
    if (!verified.has(group.userId)) return;

    setBusyId(group.userId);
    setError(null);
    setMessage(null);

    await runMarkPaid(
      group.numbers,
      group.name,
      notes[group.userId]?.trim() || undefined,
    );

    setVerified((prev) => {
      const next = new Set(prev);
      next.delete(group.userId);
      return next;
    });
    setBusyId(null);
  }

  async function markVerified() {
    const selectedGroups = groups.filter((group) => verified.has(group.userId));
    const all = Array.from(
      new Set(selectedGroups.flatMap((group) => group.numbers)),
    );

    if (all.length === 0) return;

    if (
      !window.confirm(
        `¿Marcar ${all.length} número(s) de ${selectedGroups.length} comprador(es) como pagados? Tenés 10 minutos para deshacer.`,
      )
    ) {
      return;
    }

    setBusyId("all");
    setError(null);
    setMessage(null);

    await runMarkPaid(all, "las reservas seleccionadas");
    setVerified(new Set());
    setBusyId(null);
  }

  async function undo() {
    if (!lastAction) return;

    setBusyId("undo");
    setError(null);
    setMessage(null);

    const result = await undoMarkReservationPaid(
      raffleId,
      lastAction.numbers,
    );

    if (!result.ok) {
      setError(result.error);
    } else {
      setMessage(
        `Se revirtieron ${result.count} número(s): vuelven a reserva del comprador.`,
      );
    }

    setLastAction(null);
    setBusyId(null);
    router.refresh();
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
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, teléfono o número…"
            className="pl-9"
            aria-label="Buscar reservas"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length} de {groups.length} reservas
        </span>
      </div>

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

      {lastAction && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p>
            Marcaste como pagado a <strong>{lastAction.name}</strong>. Podés
            deshacerlo durante {Math.floor(undoLeft / 60)}:
            {String(undoLeft % 60).padStart(2, "0")}.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void undo()}
            disabled={busyId !== null}
          >
            <Undo2 className="mr-1.5 h-4 w-4" />
            Deshacer
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No hay reservas que coincidan con la búsqueda.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((group) => {
            const total = group.numbers.length * pricePerNumber;
            const chat = waLink(group.phone);
            const busy = busyId !== null;
            const isVerified = verified.has(group.userId);

            return (
              <li
                key={group.userId}
                className="space-y-3 rounded-xl border p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
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
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-emerald-600"
                      checked={isVerified}
                      onChange={() => toggleVerified(group.userId)}
                      disabled={busy}
                    />
                    Comprobante recibido
                  </label>

                  <Input
                    value={notes[group.userId] ?? ""}
                    onChange={(event) =>
                      setNotes((prev) => ({
                        ...prev,
                        [group.userId]: event.target.value,
                      }))
                    }
                    placeholder="Nota interna (opcional)"
                    maxLength={300}
                    className="sm:max-w-xs"
                    aria-label={`Nota interna para ${group.name}`}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    disabled={busy || !isVerified}
                    onClick={() => void markPaid(group)}
                    title={
                      isVerified
                        ? "Marcar como pagado"
                        : "Confirmá primero que recibiste el comprobante"
                    }
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
      )}

      {groups.length > 1 && (
        <Button
          variant="outline"
          size="sm"
          disabled={busyId !== null || verified.size === 0}
          onClick={() => void markVerified()}
          title="Marcá el comprobante de cada reserva que quieras validar"
        >
          {busyId === "all"
            ? "Marcando…"
            : `Marcar verificadas (${verified.size})`}
        </Button>
      )}
    </div>
  );
}
