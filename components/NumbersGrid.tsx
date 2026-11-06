"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, Clock, MessageCircle } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn, formatPrice } from "@/lib/utils";
import {
  locateNumber as findNumberLocation,
  normalizeJumpInput,
  parseJumpNumber,
} from "@/lib/jump-number";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeliveryAddressForm } from "@/components/DeliveryAddressForm";
import { direccionEntregaCompleta } from "@/lib/direccion";
import { notifyReservation } from "@/app/sorteos/actions";
import type { RaffleNumber } from "@/lib/types";
import { useFocusTrap } from "@/lib/use-focus-trap";

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
  const [cols, setCols] = useState(6);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 420) setCols(6);
      else if (w < 640) setCols(8);
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
    /** Aviso propio del sorteo, arriba de los datos de transferencia. */
    note?: string | null;
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
  // Hasta saber si hay sesión no se puede elegir qué columnas pedir: `anon` no
  // tiene privilegio sobre reserved_by/sold_to (migración 0080).
  const [authReady, setAuthReady] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [selectionExpired, setSelectionExpired] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [reserving, setReserving] = useState(false);
  // Dirección de entrega: null = todavía no consulté, true/false = resultado.
  // Se usa un ref y no un estado porque el valor se lee dentro del handler de
  // reserva, que corre antes de que un setState se propague.
  const direccionOk = useRef<boolean | null>(null);
  const [pideDireccion, setPideDireccion] = useState(false);
  const [jumpValue, setJumpValue] = useState("");
  // Número que la grilla acaba de ubicar: se resalta unos segundos para que el
  // comprador lo vea aunque la página haya cambiado. `seq` fuerza el efecto
  // cuando se busca el mismo número dos veces.
  const [highlight, setHighlight] = useState<{ num: number; seq: number } | null>(
    null,
  );
  const highlightSeq = useRef(0);
  const jumpTimer = useRef<number | null>(null);
  const [summary, setSummary] = useState<{
    numbers: number[];
    total: number;
    notice?: string;
  } | null>(null);

  const loginTrapRef = useFocusTrap<HTMLDivElement>(loginRequired, () =>
    setLoginRequired(false),
  );
  const summaryTrapRef = useFocusTrap<HTMLDivElement>(Boolean(summary), () =>
    setSummary(null),
  );

  // Paginación: cada página entra completa en el panel, sin scroll anidado.
  // La virtualización se mantiene para el sorteo grande: solo se montan las
  // filas de la página visible.
  const pageRows = 9;
  const pageSize = Math.max(cols, cols * pageRows);
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage((prev) => Math.min(prev, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  const pageStart = page * pageSize;
  const pageEnd = Math.min(totalCount, pageStart + pageSize);
  const rowCount = Math.ceil((pageEnd - pageStart) / cols);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 6,
  });

  // 1) Carga inicial en páginas de 1000 filas (límite de PostgREST).
  useEffect(() => {
    // Sin saber si hay sesión no se puede armar el SELECT: anon no puede leer
    // reserved_by/sold_to, así que pedirlas sin sesión devolvería 42501.
    if (!authReady) return;

    let cancelled = false;

    // `anon` no puede leer reserved_by/sold_to (migración 0080): sin sesión se
    // piden solo las columnas públicas y las dos se normalizan a null.
    interface FilaNumeros {
      id: string;
      raffle_id: string;
      number: number;
      status: string;
      reserved_by?: string | null;
      reserved_until: string | null;
      sold_to?: string | null;
      payment_id?: string | null;
      sold_at: string | null;
    }

    async function load() {
      setLoading(true);
      const map = new Map<number, RaffleNumber>();
      const pageSize = 1000;
      let from = 0;

      while (true) {
        const resultado = userId
          ? await supabase
              .from("raffle_numbers")
              .select(
                "id, raffle_id, number, status, reserved_by, reserved_until, sold_to, payment_id, sold_at",
              )
              .eq("raffle_id", raffleId)
              .order("number", { ascending: true })
              .range(from, from + pageSize - 1)
          : await supabase
              .from("raffle_numbers")
              .select(
                "id, raffle_id, number, status, reserved_until, sold_at",
              )
              .eq("raffle_id", raffleId)
              .order("number", { ascending: true })
              .range(from, from + pageSize - 1);

        const data = resultado.data as FilaNumeros[] | null;
        const fetchError = resultado.error;
        if (fetchError || !data || data.length === 0) break;

        data.forEach((n) =>
          map.set(n.number, {
            id: n.id,
            raffle_id: n.raffle_id,
            number: n.number,
            status: n.status as RaffleNumber["status"],
            reserved_by: n.reserved_by ?? null,
            reserved_until: n.reserved_until,
            sold_to: n.sold_to ?? null,
            payment_id: n.payment_id ?? null,
            sold_at: n.sold_at,
          }),
        );
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
  }, [supabase, raffleId, authReady, userId]);

  // 2) Sesión del usuario.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      setAuthReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  // 2b) Dirección de entrega: se consulta una vez por sesión y se usa como
  // portón al reservar (no al entrar). `null` = todavía no sé, y en ese caso no
  // frenamos la compra: el dato se puede pedir igual desde /perfil.
  useEffect(() => {
    if (!userId) {
      direccionOk.current = null;
      return;
    }
    let cancelado = false;
    supabase
      .from("profiles")
      .select("phone,address_line,city,province,postal_code,country")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado) return;
        direccionOk.current = direccionEntregaCompleta(data);
      });
    return () => {
      cancelado = true;
    };
  }, [supabase, userId]);

  // 2c) Countdown visual de 10 minutos para la selección (solo frontend).
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

  // El resaltado del número buscado se apaga solo: es una ayuda, no un estado.
  useEffect(() => {
    if (!highlight) return;
    const timer = window.setTimeout(() => setHighlight(null), 2500);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  // Sin temporizador pendiente al desmontar (o al cambiar de sorteo).
  useEffect(
    () => () => {
      if (jumpTimer.current !== null) window.clearTimeout(jumpTimer.current);
    },
    [],
  );

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

  /**
   * Un sorteo sin WhatsApp de contacto no se puede comprar: el comprobante viaja
   * por ahí y `buildWhatsAppHref` devuelve null. Antes el comprador elegía sus
   * números y recién al apretar «Reservar» se enteraba. En producción hay
   * sorteos activos así (creados antes de que el wizard lo exigiera), y el
   * wizard lo exige desde `superRefine` para los nuevos.
   */
  const sinDatosDeCobro = !whatsappContact;

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

    // Sin dirección no se reserva: si el número gana, no habría a dónde mandar
    // el premio. Se pide acá, con los números ya elegidos, y no al entrar al
    // sorteo. Si la consulta falló (null) no frenamos: el dato se puede
    // completar después desde /perfil y no vale la pena perder una venta.
    if (direccionOk.current === false) {
      setPideDireccion(true);
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

  const availableCount = useMemo(() => {
    let count = 0;
    numbers.forEach((number) => {
      if (number.status === "available") count += 1;
    });
    return count;
  }, [numbers]);

  /** Cambia a la página del número y lo resalta; opcionalmente le da el foco. */
  function goToNumber(target: number, moveFocus = false) {
    const location = findNumberLocation(target, totalCount, pageSize, cols);
    if (!location) return;

    setError(null);
    setPage(location.page);
    highlightSeq.current += 1;
    setHighlight({ num: target, seq: highlightSeq.current });

    // Al tipear NO movemos el foco: el comprador sigue escribiendo en el
    // campo. Solo lo pedimos al confirmar con Enter o «Ir».
    if (!moveFocus) return;

    // La página nueva se pinta en el próximo render: recién ahí existe el
    // botón del número para poder enfocarlo.
    window.setTimeout(() => {
      parentRef.current
        ?.querySelector<HTMLButtonElement>(`[data-number="${target}"]`)
        ?.focus({ preventScroll: true });
    }, 80);
  }

  function jumpToNumber() {
    const target = parseJumpNumber(jumpValue, totalCount);
    if (target === null) {
      setError(
        `Elegí un número entre 1 y ${totalCount.toLocaleString("es-AR")}.`,
      );
      return;
    }

    goToNumber(target, true);

    // Confirmar con Enter o «Ir» además elige el número si está disponible.
    const status = numbers.get(target)?.status ?? "available";
    if (status !== "available") {
      setError(
        `El número ${fmtNum(target)} no está disponible (${
          status === "sold" ? "vendido" : "reservado"
        }).`,
      );
      return;
    }

    if (!userId) {
      setLoginRequired(true);
      return;
    }

    setSelectionExpired(false);
    setSelected((prev) => {
      if (prev.has(target)) return prev;
      const next = new Set(prev);
      next.add(target);
      return next;
    });
  }

  /**
   * Mientras escribe, la grilla ubica el número sin seleccionarlo: evita
   * saltos a medio tipear y deja la selección para Enter o «Ir».
   */
  function handleJumpChange(raw: string) {
    const normalized = normalizeJumpInput(raw, digits);
    setJumpValue(normalized);

    if (jumpTimer.current !== null) {
      window.clearTimeout(jumpTimer.current);
      jumpTimer.current = null;
    }

    const target = parseJumpNumber(normalized, totalCount);
    if (target === null) return;

    jumpTimer.current = window.setTimeout(() => goToNumber(target), 350);
  }

  function clearSelection() {
    setSelected(new Set());
    setDeadline(null);
    setRemaining(0);
    setError(null);
  }

  return (
    <div className={cn("space-y-4", selected.size > 0 && "pb-28 lg:pb-0")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-subtle">
          <span>
            <span aria-live="polite">
              {selected.size} número{selected.size === 1 ? "" : "s"}{" "}
              seleccionado{selected.size === 1 ? "" : "s"}
            </span>{" "}
            · Total:{" "}
            <span className="font-semibold text-foreground">
              {formatPrice(totalPrice)}
            </span>
          </span>
          {selected.size > 0 && deadline !== null && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground"
              title="Tiempo para terminar de elegir. La reserva después dura 48 horas."
            >
              <Clock className="h-3 w-3" aria-hidden="true" /> Elegí en {formatCountdown(remaining)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {userId ? (
            <Button
              onClick={handleReservePrepaid}
              disabled={
                selected.size === 0 || reserving || !isActive || sinDatosDeCobro
              }
            >
              <MessageCircle className="mr-1.5 h-4 w-4" />
              {reserving ? "Reservando…" : "Reservar y enviar comprobante"}
            </Button>
          ) : (
            <Link href={loginHref} className={buttonVariants()}>
              <MessageCircle className="mr-1.5 h-4 w-4" />
              Iniciar sesión para participar
            </Link>
          )}

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

      {isTransfer && (
        <p className="text-[11px] leading-relaxed text-fg-subtle">
          Si el organizador cancela el sorteo, se devuelve el{" "}
          <strong>100% del dinero por el mismo medio de pago</strong>. No se
          realizan devoluciones una vez confirmado el pago y realizado el
          sorteo.
        </p>
      )}

      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-[13px] text-destructive">
          {error}
        </p>
      )}

      {selectionExpired && (
        <p className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-[13px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" /> Tu selección expiró. Elegí de nuevo tus números.
        </p>
      )}

      <div className="space-y-2">
        {sinDatosDeCobro && (
          <p
            role="status"
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200"
          >
            <strong>Este sorteo todavía no se puede comprar.</strong> El
            organizador no cargó los datos para recibir el pago ni un WhatsApp de
            contacto, así que no hay forma de reservar ni de enviar el
            comprobante. Probá más tarde o contactá al organizador.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            Tocá un número para elegirlo
            <span className="ml-1 font-normal text-muted-foreground">
              · los vendidos y reservados están bloqueados
            </span>
          </p>
          <span className="text-xs text-muted-foreground">
            {availableCount.toLocaleString("es-AR")} disponibles de{" "}
            {totalCount.toLocaleString("es-AR")}
          </span>
        </div>
        <div
          className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-hairline bg-panel-1/60 px-3 py-2 text-[11px] text-fg-subtle"
          aria-label="Leyenda de estados"
        >
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] border border-emerald-500/50 bg-emerald-500/15" />{" "}
            Disponible
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-amber-500" /> Reservado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] border border-rose-500/50 bg-rose-500/20" />{" "}
            Vendido
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] bg-brand-500" /> Tu selección
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label
              htmlFor="jump-number"
              className="text-xs text-muted-foreground"
            >
              Ir a un número
            </label>
            <Input
              id="jump-number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={jumpValue}
              onChange={(event) => handleJumpChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  jumpToNumber();
                }
              }}
              placeholder={`Ej: ${fmtNum(Math.min(150, totalCount))}`}
              aria-describedby="jump-number-help"
              className="h-9 w-28"
            />
            <p
              id="jump-number-help"
              className="w-full text-[11px] text-muted-foreground"
            >
              Al escribirlo, la grilla salta al número y lo resalta. Enter o
              «Ir» también lo dejan seleccionado.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={jumpToNumber}>
            Ir
          </Button>
          {selected.size > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSelection}
            >
              Limpiar selección
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="py-16 text-center text-muted-foreground">
          Cargando números…
        </p>
      ) : (
        <div
          ref={parentRef}
          className="overflow-hidden rounded-xl border border-hairline bg-panel-1 p-2 sm:p-3"
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const start = pageStart + virtualRow.index * cols;
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
                    if (num > pageEnd) {
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
                        data-number={num}
                        onClick={() => toggle(num)}
                        disabled={disabled}
                        aria-label={`Número ${fmtNum(num)} - ${status}`}
                        aria-pressed={isSelected}
                        className={cn(
                          "relative flex h-11 items-center justify-center overflow-hidden rounded-md border text-xs font-medium leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10 sm:text-[13px]",
                          status === "available" &&
                            !isSelected &&
                            "border-hairline bg-panel-1 text-fg-muted hover:border-brand-500/60 hover:text-fg",
                          status === "sold" &&
                            "cursor-not-allowed border-rose-500/30 bg-rose-500/10 text-rose-700 line-through dark:text-rose-300",
                          status === "reserved" &&
                            "cursor-not-allowed border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                          isSelected &&
                            "border-brand-500 bg-brand-500 font-semibold text-ink ring-2 ring-brand-500/30",
                          highlight?.num === num &&
                            "border-amber-400 ring-2 ring-amber-400/70 ring-offset-1 ring-offset-panel-1",
                          disabled && "cursor-not-allowed",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute right-1 top-1 h-1.5 w-1.5 rounded-full",
                            status === "available" && "bg-emerald-500/60",
                            status === "reserved" && "bg-amber-500",
                            status === "sold" && "bg-rose-500",
                            isSelected && "bg-ink",
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

      {!loading && totalCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[12px] text-fg-subtle">
            {(pageStart + 1).toLocaleString("es-AR")}–
            {pageEnd.toLocaleString("es-AR")} de{" "}
            {totalCount.toLocaleString("es-AR")} números
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => Math.max(0, prev - 1))}
              disabled={page === 0}
            >
              Anterior
            </Button>
            <span className="font-mono text-[11px] text-fg-subtle">
              Página {page + 1} de {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => Math.min(pageCount - 1, prev + 1))}
              disabled={page >= pageCount - 1}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {selected.size > 0 && isActive && !summary && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-canvas/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {selected.size} número{selected.size === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatPrice(totalPrice)}
                {deadline !== null && remaining > 0
                  ? ` · elegí en ${formatCountdown(remaining)}`
                  : ""}
              </p>
            </div>
            {userId ? (
              <Button
                className="shrink-0"
                disabled={reserving || !isActive}
                onClick={handleReservePrepaid}
              >
                <MessageCircle className="mr-1.5 h-4 w-4" />
                {reserving ? "Reservando…" : "Reservar"}
              </Button>
            ) : (
              <Link href={loginHref} className={buttonVariants()}>
                <MessageCircle className="mr-1.5 h-4 w-4" />
                Iniciar sesión
              </Link>
            )}
          </div>
        </div>
      )}

      {loginRequired && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-required-title"
          onClick={() => setLoginRequired(false)}
        >
          <div
            ref={loginTrapRef}
            tabIndex={-1}
            className="w-full max-w-sm rounded-xl border border-hairline bg-panel-1 p-6 text-center shadow-card outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="login-required-title" className="text-lg font-semibold">
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
          role="dialog"
          aria-modal="true"
          aria-labelledby="summary-title"
          onClick={() => setSummary(null)}
        >
          <div
            ref={summaryTrapRef}
            tabIndex={-1}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-hairline bg-panel-1 p-6 shadow-card outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="summary-title" className="text-lg font-semibold">
              Reserva confirmada
            </h3>
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
              <p className="mt-3 flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-[12px] text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {summary.notice} El resumen incluye solo los que sí quedaron
                reservados.
              </p>
            )}

            <p className="mt-4 text-sm">
              Total a pagar:{" "}
              <span className="text-lg font-bold">
                {formatPrice(summary.total)}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              El contador de arriba es solo para elegir. La reserva queda
              guardada {PREPAID_HOLD_HOURS} h hasta que el organizador confirme
              el pago.
            </p>

            {isTransfer &&
              (transferInfo?.alias ||
                transferInfo?.cbu ||
                transferInfo?.bank) && (
                <div className="mt-4 space-y-1.5">
                  {/* Aviso del propio sorteo (0090). Va primero, antes de que
                      nadie copie el alias. */}
                  {transferInfo.note && (
                    <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs font-medium text-amber-900 dark:text-amber-200">
                      {transferInfo.note}
                    </p>
                  )}
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
                  "mt-4 w-full",
                )}
              >
                <MessageCircle className="mr-1.5 h-4 w-4" />
                Enviar comprobante por WhatsApp
              </a>
            ) : (
              <p className="mt-4 flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-[12px] text-amber-700 dark:text-amber-300">
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

      {/* La dirección se pide acá, al reservar, y no al entrar al sorteo: pedirla
          antes frena la compra de alguien que todavía no eligió. */}
      {pideDireccion && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="direccion-reserva-title"
        >
          <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl">
            <h2 id="direccion-reserva-title" className="text-lg font-semibold">
              ¿A dónde te mandamos el premio?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Necesitamos una dirección antes de reservar. Es privada: no se
              muestra en tu perfil público. Después de guardarla seguimos con la
              reserva de tus números.
            </p>
            <DeliveryAddressForm
              submitLabel="Guardar y reservar"
              onSaved={() => {
                direccionOk.current = true;
                setPideDireccion(false);
                void handleReservePrepaid();
              }}
            />
            <Button
              variant="outline"
              className="mt-2 w-full"
              onClick={() => setPideDireccion(false)}
            >
              Ahora no
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
