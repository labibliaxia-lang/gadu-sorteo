"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MessageCircle } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn, formatPrice } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { notifyReservation } from "@/app/sorteos/actions";
import type { RaffleNumber } from "@/lib/types";

const RESERVATION_SECONDS = 10 * 60;

/** Fila de dato de transferencia con botón de copiar. */
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard bloqueado: el valor queda visible igual
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right font-mono font-semibold">
        {value}
      </span>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded border px-2 py-0.5 text-xs transition hover:bg-accent"
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

/**
 * Mercado Pago queda oculto por defecto mientras se opera con prepago manual.
 * El código del checkout y del simulador se conserva: con
 * NEXT_PUBLIC_ENABLE_MP=true vuelven a mostrarse los botones de pago real.
 */
const MP_ENABLED = process.env.NEXT_PUBLIC_ENABLE_MP === "true";

/** Hold de la reserva prepaga: mismo default que `reserve_numbers_prepaid`. */
const PREPAID_HOLD_HOURS = 48;

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function useColumnCount() {
  const [cols, setCols] = useState(5);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 640) setCols(5);
      else if (w < 1024) setCols(10);
      else setCols(20);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return cols;
}

interface NumbersGridProps {  raffleId: string;
  pricePerNumber: number;
  raffleStatus: string;
  isDev?: boolean;
  paymentType?: "mercadopago" | "transferencia";
  transferInfo?: {
    alias?: string | null;
    cbu?: string | null;
    bank?: string | null;
    whatsapp?: string | null;
  };
  raffleTitle?: string;
}

export function NumbersGrid({
  raffleId,
  pricePerNumber,
  raffleStatus,
  isDev = false,
  paymentType = "mercadopago",
  transferInfo,
  raffleTitle,
}: NumbersGridProps) {
  const supabase = useMemo(() => createClient(), []);
  const cols = useColumnCount();
  const parentRef = useRef<HTMLDivElement>(null);
  const loginHref = `/login?next=${encodeURIComponent(`/sorteos/${raffleId}`)}`;

  const [numbers, setNumbers] = useState<Map<number, RaffleNumber>>(new Map());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [selectionExpired, setSelectionExpired] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [reserving, setReserving] = useState(false);
  const [summary, setSummary] = useState<{
    numbers: number[];
    total: number;
    notice?: string;
  } | null>(null);

  const rowCount = Math.ceil(totalCount / cols);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 6,
  });

  // 1) Carga inicial en páginas de 1000 filas (límite de PostgREST).
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const map = new Map<number, RaffleNumber>();
      const pageSize = 1000;
      let from = 0;

      while (true) {
        const { data, error: fetchError } = await supabase
          .from("raffle_numbers")
          .select(
            "id, raffle_id, number, status, reserved_by, reserved_until, sold_to, sold_at",
          )
          .eq("raffle_id", raffleId)
          .order("number", { ascending: true })
          .range(from, from + pageSize - 1);

        if (fetchError || !data || data.length === 0) break;

        data.forEach((n) => map.set(n.number, n as RaffleNumber));
        if (data.length < pageSize) break;
        from += pageSize;
      }

      if (!cancelled) {
        setNumbers(map);
        setTotalCount(map.size > 0 ? Math.max(...map.keys()) : 0);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, raffleId]);

  // 2) Sesión del usuario.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  // 2b) Countdown visual de 10 minutos para la selección (solo frontend).
  useEffect(() => {
    if (selected.size > 0) {
      if (deadline === null) {
        setDeadline(Date.now() + RESERVATION_SECONDS * 1000);
      }
    } else if (deadline !== null) {
      setDeadline(null);
      setRemaining(0);
    }
  }, [selected.size, deadline]);

  useEffect(() => {
    if (deadline === null) return;

    const id = setInterval(() => {
      const diff = deadline - Date.now();
      if (diff <= 0) {
        clearInterval(id);
        setDeadline(null);
        setRemaining(0);
        setSelected(new Set());
        setSelectionExpired(true);
      } else {
        setRemaining(Math.ceil(diff / 1000));
      }
    }, 1000);

    return () => clearInterval(id);
  }, [deadline]);

  // 3) Realtime: actualiza solo las filas que cambian.
  useEffect(() => {
    const channel = supabase
      .channel(`raffle_numbers_${raffleId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "raffle_numbers",
          filter: `raffle_id=eq.${raffleId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setNumbers((prev) => {
              const next = new Map(prev);
              next.delete((payload.old as RaffleNumber).number);
              return next;
            });
          } else {
            const row = payload.new as RaffleNumber;
            setNumbers((prev) => {
              const next = new Map(prev);
              next.set(row.number, row);
              return next;
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, raffleId]);

  const toggle = useCallback(
    (num: number) => {
      setSelectionExpired(false);
      // Bloqueo de sesión: sin usuario logueado no se permite seleccionar.
      if (!userId) {
        setLoginRequired(true);
        return;
      }
      const status = numbers.get(num)?.status ?? "available";
      if (status !== "available") return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(num)) next.delete(num);
        else next.add(num);
        return next;
      });
    },
    [numbers, userId],
  );

  const totalPrice = selected.size * pricePerNumber;

  // Enlace de WhatsApp para el prepago manual: lo arma el comprador con los
  // números ya reservados y el organizador recibe el comprobante.
  const isTransfer = paymentType === "transferencia";
  const whatsappContact = transferInfo?.whatsapp ?? null;

  function buildWhatsAppHref(nums: number[], total: number): string | null {
    const raw = whatsappContact;
    if (!raw) return null;
    const digits = raw.replace(/\D/g, "");
    if (!digits) return null;
    const phone = digits.startsWith("54") ? digits : `54${digits}`;
    const sorted = [...nums].sort((a, b) => a - b);
    const numbersText = sorted.length > 0 ? sorted.join(", ") : "a confirmar";
    const msg = `Hola! Quiero participar en "${
      raffleTitle ?? "el sorteo"
    }" con los números: ${numbersText}. Total: ${formatPrice(total)}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }

  const summaryWhatsappHref = summary
    ? buildWhatsAppHref(summary.numbers, summary.total)
    : null;

  /**
   * Reserva los números elegidos y abre el resumen con el comprobante.
   * La reserva la hace el RPC con hold largo; el pago lo confirma el
   * organizador a mano desde el panel.
   */
  async function handleReservePrepaid() {
    if (!userId) {
      window.location.href = loginHref;
      return;
    }
    if (selected.size === 0) return;

    const picked = Array.from(selected).sort((a, b) => a - b);

    if (!buildWhatsAppHref(picked, totalPrice)) {
      setError(
        "El organizador todavía no cargó un WhatsApp de contacto. Probá más tarde.",
      );
      return;
    }

    setReserving(true);
    setError(null);

    try {
      const { data, error: reserveError } = await supabase.rpc(
        "reserve_numbers_prepaid",
        {
          p_raffle_id: raffleId,
          p_numbers: picked,
          p_hold_hours: PREPAID_HOLD_HOURS,
        },
      );

      if (reserveError) {
        setError(reserveError.message);
        return;
      }

      const reserved = ((data as number[] | null) ?? [])
        .slice()
        .sort((a, b) => a - b);

      if (reserved.length === 0) {
        setSelected(new Set());
        setError(
          `Estos números ya no están disponibles: ${picked.join(
            ", ",
          )}. Elegí otros.`,
        );
        return;
      }

      const got = new Set(reserved);
      const missing = picked.filter((n) => !got.has(n));

      // Refleja la reserva en la grilla sin esperar al realtime.
      setNumbers((prev) => {
        const next = new Map(prev);
        reserved.forEach((num) => {
          const row = next.get(num);
          if (row) {
            next.set(num, {
              ...row,
              status: "reserved",
              reserved_by: userId,
              reserved_until: new Date(
                Date.now() + PREPAID_HOLD_HOURS * 60 * 60 * 1000,
              ).toISOString(),
            });
          }
        });
        return next;
      });

      setSummary({
        numbers: reserved,
        total: reserved.length * pricePerNumber,
        notice:
          missing.length > 0
            ? `Estos números ya no estaban disponibles: ${missing.join(", ")}.`
            : undefined,
      });
      setSelected(new Set());
      setDeadline(null);

      // Email de respaldo: no bloquea la reserva ni la apertura del resumen.
      void notifyReservation(raffleId, reserved).catch(() => {});
    } catch {
      setError("Error de red al reservar los números.");
    } finally {
      setReserving(false);
    }
  }

  async function handleCheckout() {
    if (!userId) {
      window.location.href = loginHref;
      return;
    }
    if (selected.size === 0) return;

    setCheckingOut(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raffleId,
          numbers: Array.from(selected).sort((a, b) => a - b),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "No se pudo iniciar el pago.");
        // Si algunos números ya no estaban disponibles, recargarlos.
        if (json.unavailable) {
          const unavailable = new Set<number>(json.unavailable);
          setSelected((prev) => {
            const next = new Set(prev);
            unavailable.forEach((n) => next.delete(n));
            return next;
          });
        }
        return;
      }

      // Redirige a Checkout Pro de Mercado Pago.
      if (json.init_point) {
        window.location.href = json.init_point;
      }
    } catch {
      setError("Error de red al iniciar el pago.");
    } finally {
      setCheckingOut(false);
    }
  }

  async function handleMockPayment() {
    if (!userId) {
      window.location.href = loginHref;
      return;
    }
    if (selected.size === 0) return;

    setCheckingOut(true);
    setError(null);

    try {
      const res = await fetch("/api/mock-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raffleId,
          numbers: Array.from(selected).sort((a, b) => a - b),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "No se pudo simular el pago.");
        if (json.unavailable) {
          const unavailable = new Set<number>(json.unavailable);
          setSelected((prev) => {
            const next = new Set(prev);
            unavailable.forEach((n) => next.delete(n));
            return next;
          });
        }
        return;
      }

      window.location.href = "/pago/exitoso";
    } catch {
      setError("Error de red al simular el pago.");
    } finally {
      setCheckingOut(false);
    }
  }

  const isActive = raffleStatus === "active";
  const digits = totalCount > 0 ? String(totalCount).length : 4;
  const fmtNum = (n: number) => String(n).padStart(digits, "0");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            {selected.size} número{selected.size === 1 ? "" : "s"} seleccionado
            {selected.size === 1 ? "" : "s"} · Total:{" "}
            <span className="font-semibold text-foreground">
              {formatPrice(totalPrice)}
            </span>
          </span>
          {selected.size > 0 && deadline !== null && (
            <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
              ⏱ {formatCountdown(remaining)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleReservePrepaid}
            disabled={selected.size === 0 || reserving || !isActive}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <MessageCircle className="mr-1.5 h-4 w-4" />
            {reserving
              ? "Reservando…"
              : userId
                ? "Reservar y enviar comprobante"
                : "Inicia sesión para participar"}
          </Button>

          {MP_ENABLED && !isTransfer && (
            <>
              {isDev && (
                <Button
                  onClick={handleMockPayment}
                  disabled={selected.size === 0 || checkingOut || !isActive}
                >
                  {checkingOut
                    ? "Procesando…"
                    : userId
                      ? "Simular Pago (Solo Dev)"
                      : "Inicia sesión para participar"}
                </Button>
              )}
              <Button
                variant={isDev ? "outline" : "default"}
                onClick={handleCheckout}
                disabled={selected.size === 0 || checkingOut || !isActive}
              >
                {checkingOut
                  ? "Preparando pago…"
                  : userId
                    ? isDev
                      ? "Pagar real (MP)"
                      : "Reservar y pagar"
                    : "Inicia sesión para participar"}
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {selectionExpired && (
        <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          ⚠️ Tu selección expiró. Elegí de nuevo tus números.
        </p>
      )}

      <div className="mb-2 flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-emerald-500" /> Disponible
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-amber-500" /> Reservado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-rose-500" /> Vendido
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-blue-500" /> Tu selección
        </span>
      </div>

      {loading ? (
        <p className="py-16 text-center text-muted-foreground">
          Cargando números…
        </p>
      ) : (
        <div
          ref={parentRef}
          className="h-[60vh] overflow-auto rounded-xl border bg-card p-3 shadow-sm"
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const start = virtualRow.index * cols;
              return (
                <div
                  key={virtualRow.key}
                  className="grid gap-1.5"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from({ length: cols }).map((_, i) => {
                    const num = start + i + 1;
                    if (num > totalCount) {
                      return <div key={i} />;
                    }
                    const n = numbers.get(num);
                    const status = n?.status ?? "available";
                    const isSelected = selected.has(num);
                    const disabled = status !== "available" || !isActive;

                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => toggle(num)}
                        disabled={disabled}
                        aria-label={`Número ${fmtNum(num)} - ${status}`}
                        className={cn(
                          "relative flex h-9 items-center justify-center overflow-hidden rounded-lg border border-slate-300 bg-card text-xs font-semibold leading-none text-foreground transition-all duration-150 hover:border-slate-400 hover:shadow-sm active:scale-95 dark:border-slate-700 sm:h-10 sm:text-sm",
                          status === "sold" &&
                            "cursor-not-allowed bg-muted/40 text-muted-foreground opacity-70",
                          status === "reserved" &&
                            "cursor-not-allowed bg-amber-500/10 text-amber-800 dark:text-amber-300",
                          isSelected &&
                            "border-blue-500 ring-2 ring-blue-500/60",
                          disabled && "cursor-not-allowed",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute right-1 top-1 h-2 w-2 rounded-full",
                            status === "sold" && "bg-rose-500",
                            status === "reserved" && "bg-amber-500",
                            isSelected && "bg-blue-500",
                            status === "available" &&
                              !isSelected &&
                              "bg-emerald-500",
                          )}
                        />
                        {fmtNum(num)}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loginRequired && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setLoginRequired(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">
              Debes iniciar sesión para participar
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Iniciá sesión con Google para elegir y reservar tus números.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="outline" onClick={() => setLoginRequired(false)}>
                Cancelar
              </Button>
              <Button onClick={() => (window.location.href = loginHref)}>
                Ir a iniciar sesión
              </Button>
            </div>
          </div>
        </div>
      )}

      {summary && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSummary(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">Reserva confirmada</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.numbers.length} número
              {summary.numbers.length === 1 ? "" : "s"} reservado
              {summary.numbers.length === 1 ? "" : "s"} en{" "}
              {raffleTitle ?? "el sorteo"}.
            </p>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {summary.numbers.map((n) => (
                <span
                  key={n}
                  className="rounded-md bg-secondary px-2 py-1 font-mono text-sm font-semibold"
                >
                  {fmtNum(n)}
                </span>
              ))}
            </div>

            {summary.notice && (
              <p className="mt-3 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                ⚠️ {summary.notice} El resumen incluye solo los que sí quedaron
                reservados.
              </p>
            )}

            <p className="mt-4 text-sm">
              Total a pagar:{" "}
              <span className="text-lg font-bold">
                {formatPrice(summary.total)}
              </span>
            </p>

            {isTransfer &&
              (transferInfo?.alias ||
                transferInfo?.cbu ||
                transferInfo?.bank) && (
                <div className="mt-4 space-y-1.5">
                  <p className="text-sm font-semibold">Datos para transferir</p>
                  {transferInfo.alias && (
                    <CopyRow label="Alias" value={transferInfo.alias} />
                  )}
                  {transferInfo.cbu && (
                    <CopyRow label="CBU" value={transferInfo.cbu} />
                  )}
                  {transferInfo.bank && (
                    <CopyRow label="Banco" value={transferInfo.bank} />
                  )}
                  <p className="text-xs text-muted-foreground">
                    Transferí el total y después enviá el comprobante por
                    WhatsApp.
                  </p>
                </div>
              )}

            {summaryWhatsappHref ? (
              <a
                href={summaryWhatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants(),
                  "mt-4 w-full bg-emerald-600 text-white hover:bg-emerald-700",
                )}
              >
                <MessageCircle className="mr-1.5 h-4 w-4" />
                Enviar comprobante por WhatsApp
              </a>
            ) : (
              <p className="mt-4 rounded-md bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                El organizador no cargó un WhatsApp de contacto. Usá los datos
                de transferencia y coordiná el pago desde la página del sorteo.
              </p>
            )}

            <p className="mt-3 text-xs text-muted-foreground">
              Guardamos tus números {PREPAID_HOLD_HOURS} h. Cuando el
              organizador reciba el comprobante, los marca como pagados. Podés
              seguir tus números desde «Mis números».
            </p>

            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={() => setSummary(null)}
            >
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
