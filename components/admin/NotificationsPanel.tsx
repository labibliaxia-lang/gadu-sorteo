"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clock, Loader2, MessageCircle, TimerReset, X } from "lucide-react";

import {
  approveReservation,
  dismissNotification,
  extendReservation,
  markNotificationRead,
  releaseReservation,
} from "@/app/[locale]/admin/notificaciones/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn, formatPrice } from "@/lib/utils";
import { telefonoLegible, waHref, waLink } from "@/lib/whatsapp";

export interface NotificationItem {
  id: string;
  type: string;
  title?: string | null;
  message?: string | null;
  raffle_id: string | null;
  payload: {
    numbers?: number[];
    count?: number;
    buyer_name?: string;
    buyer_phone?: string | null;
    winner_number?: number;
    total?: number | string;
    price_per_number?: number | string;
  } | null;
  status: string;
  priority: string;
  created_at: string;
  expires_at: string | null;
}

const TIPO_LABEL: Record<string, string> = {
  reservation_pending: "Reserva esperando decisión",
  payment_approved: "Pago acreditado",
  reservation_expired: "Reserva vencida y liberada",
  refund_requested: "Pedido de devolución",
  refund_confirmed: "El comprador confirmó que recibió la devolución",
  winner_unreachable: "El ganador no tiene email: avisale vos",
  organizer_review: "Nueva reseña",
  organizer_question: "Nueva pregunta",
  draw_ready: "Sorteo listo para sortear",
  report_pending: "Denuncia pendiente",
};

/** Tipos que necesitan una decisión del organizador. El resto es informativo. */
const DECISIONES = new Set([
  "reservation_pending",
  "refund_requested",
  "draw_ready",
  "report_pending",
]);

function restante(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return "vencida";

  const s = Math.floor(ms / 1000);

  // 48 h se lee mejor como "2 días" que como "2880:00".
  if (s >= 24 * 3600) {
    const dias = Math.floor(s / 86400);
    return `${dias} día${dias === 1 ? "" : "s"}`;
  }
  if (s >= 3600) {
    const horas = Math.floor(s / 3600);
    const minutos = Math.floor((s % 3600) / 60);
    return `${horas} h ${minutos} min`;
  }
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function ordenar(lista: NotificationItem[]): NotificationItem[] {
  return [...lista].sort((a, b) => {
    const peso = (i: NotificationItem) => (i.priority === "urgent" ? 0 : 1);
    if (peso(a) !== peso(b)) return peso(a) - peso(b);
    const vence = (i: NotificationItem) =>
      i.expires_at ? new Date(i.expires_at).getTime() : Number.MAX_SAFE_INTEGER;
    if (vence(a) !== vence(b)) return vence(a) - vence(b);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function agrupar(
  lista: NotificationItem[],
): { raffleId: string; items: NotificationItem[] }[] {
  const mapa = new Map<string, NotificationItem[]>();
  for (const item of lista) {
    const clave = item.raffle_id ?? "sin-sorteo";
    const actual = mapa.get(clave) ?? [];
    actual.push(item);
    mapa.set(clave, actual);
  }
  return [...mapa.entries()].map(([raffleId, items]) => ({ raffleId, items }));
}

export function NotificationsPanel({ inicial }: { inicial: NotificationItem[] }) {
  const supabase = createClient();
  const [items, setItems] = useState<NotificationItem[]>(inicial);
  const [titulos, setTitulos] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id, type, raffle_id, payload, status, priority, created_at, expires_at")
      .order("created_at", { ascending: false })
      .limit(100);

    const filas = (data ?? []) as NotificationItem[];
    setItems(filas);

    const ids = [...new Set(filas.map((f) => f.raffle_id).filter(Boolean))] as string[];
    if (ids.length > 0) {
      const { data: sorteos } = await supabase
        .from("raffles")
        .select("id, title")
        .in("id", ids);
      setTitulos(
        Object.fromEntries(
          (sorteos ?? []).map((s) => [s.id as string, s.title as string]),
        ),
      );
    }
  }, [supabase]);

  useEffect(() => {
    void cargar();

    const canal = supabase
      .channel("notifications-panel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => void cargar(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [cargar, supabase]);

  async function ejecutar(
    id: string,
    accion: () => Promise<{ ok: boolean; error?: string }>,
    mensajeOk?: string,
  ) {
    setBusy(id);
    setError(null);
    setAviso(null);

    try {
      const res = await accion();
      if (!res.ok) {
        setError(res.error ?? "No se pudo completar la acción.");
        return;
      }
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: "resolved" } : item,
        ),
      );
      if (mensajeOk) setAviso(mensajeOk);

      // Auto-avance: llevar la vista a la próxima decisión pendiente.
      const siguiente = ordenar(
        items.filter(
          (item) =>
            DECISIONES.has(item.type) && item.status !== "resolved" && item.id !== id,
        ),
      )[0];
      if (siguiente) {
        window.setTimeout(() => {
          document
            .getElementById(`noti-${siguiente.id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 150);
      }
    } catch (falla) {
      console.error("[notificaciones] la acción falló", falla);
      setError("La acción falló por un problema de conexión. Probá de nuevo.");
    } finally {
      setBusy(null);
    }
  }

  const pendientes = ordenar(
    items.filter((i) => i.status === "pending" || i.status === "read"),
  );
  const decisiones = pendientes.filter((i) => DECISIONES.has(i.type));
  const avisos = pendientes.filter((i) => !DECISIONES.has(i.type));
  const historial = items.filter(
    (i) => i.status === "resolved" || i.status === "expired",
  );

  function tituloSorteo(raffleId: string): string {
    if (raffleId === "sin-sorteo") return "General";
    return titulos[raffleId] ?? "Sorteo";
  }

  function tarjeta(item: NotificationItem, esDecision: boolean) {
    const numeros = item.payload?.numbers ?? [];
    const nombre = item.payload?.buyer_name ?? "Un comprador";
    const telefono = item.payload?.buyer_phone ?? null;
    const destino = telefonoLegible(telefono);
    const total = item.payload?.total;
    const reloj = restante(item.expires_at, now);
    const esReserva = item.type === "reservation_pending";
    const vencida = reloj === "vencida";

    return (
      <article
        key={item.id}
        id={`noti-${item.id}`}
        className={cn(
          "rounded-xl border bg-panel-1 p-4",
          esDecision && !vencida ? "border-amber-500/40" : "border-hairline",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">
              {item.title ?? TIPO_LABEL[item.type] ?? item.type}
            </p>
            {item.message && (
              <p className="max-w-md text-xs text-fg-subtle">{item.message}</p>
            )}
            <p className="text-sm text-fg-muted">
              {nombre}
              {numeros.length > 0 && (
                <>
                  {" "}
                  · {numeros.length} número{numeros.length === 1 ? "" : "s"}:{" "}
                  <span className="font-mono text-[13px]">{numeros.join(", ")}</span>
                </>
              )}
            </p>
            {total !== undefined && total !== null && (
              <p className="text-xs text-fg-subtle">
                Total estimado: {formatPrice(Number(total))}
              </p>
            )}
            {item.type === "refund_confirmed" && (
              <p className="max-w-md text-xs text-fg-subtle">
                El comprador avisó que recibió la devolución. La deuda se cierra
                cuando la marques como pagada en el sorteo.
              </p>
            )}
            {item.type === "payment_approved" && (
              <p className="max-w-md text-xs text-fg-subtle">
                Mercado Pago acreditó el pago: los números ya están vendidos.
              </p>
            )}
            {item.type === "winner_unreachable" && (
              <p className="max-w-md text-xs text-fg-subtle">
                El sorteo tiene ganador pero no se le pudo avisar por email.
                Contactalo con el número ganador a mano.
              </p>
            )}
          </div>

          {reloj && esReserva && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                vencida
                  ? "bg-destructive/10 text-destructive"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
              )}
            >
              <Clock className="h-3 w-3" aria-hidden="true" />
              {vencida ? "vencida" : `vence en ${reloj}`}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {esReserva && (
            <>
              <Button
                size="sm"
                onClick={() =>
                  void ejecutar(
                    item.id,
                    () => approveReservation(item.id),
                    "Reserva aprobada: los números quedaron vendidos.",
                  )
                }
                disabled={busy === item.id}
              >
                {busy === item.id ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-4 w-4" />
                )}
                Aprobar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void ejecutar(
                    item.id,
                    () => releaseReservation(item.id),
                    "Reserva liberada: los números volvieron a estar disponibles.",
                  )
                }
                disabled={busy === item.id}
              >
                <X className="mr-1.5 h-4 w-4" />
                Liberar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void ejecutar(
                    item.id,
                    () => extendReservation(item.id, 15),
                    "Reserva ampliada 15 minutos.",
                  )
                }
                disabled={busy === item.id}
              >
                <TimerReset className="mr-1.5 h-4 w-4" />
                +15 min
              </Button>

              {destino ? (
                <a
                  href={waHref(telefono, nombre, numeros)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                  title={`Abre WhatsApp de ${nombre} (${destino})`}
                >
                  <MessageCircle className="mr-1.5 h-4 w-4" />
                  Pedir comprobante
                </a>
              ) : (
                <span className="text-[11px] text-fg-subtle">
                  Sin teléfono cargado: no se puede pedir por WhatsApp
                </span>
              )}
            </>
          )}

          {item.type === "winner_unreachable" && destino && (
            <a
              href={waLink(
                telefono,
                `Hola ${nombre}, saliste ganador del sorteo con el número ${
                  item.payload?.winner_number ?? ""
                }. Te escribo para coordinar la entrega del premio.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <MessageCircle className="mr-1.5 h-4 w-4" />
              Avisarle por WhatsApp
            </a>
          )}

          {item.raffle_id && (
            <Link
              href={`/admin/sorteos/${item.raffle_id}`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Ver sorteo
            </Link>
          )}

          {item.status === "pending" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void ejecutar(
                  item.id,
                  () => markNotificationRead(item.id),
                  "Marcada como leída.",
                )
              }
              disabled={busy === item.id}
            >
              Marcar leída
            </Button>
          )}

          {!esReserva && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void ejecutar(
                  item.id,
                  () => dismissNotification(item.id),
                  "Aviso archivado.",
                )
              }
              disabled={busy === item.id}
            >
              <Check className="mr-1.5 h-4 w-4" />
              Listo
            </Button>
          )}
        </div>

        {esReserva && destino && (
          <p className="mt-1 text-[11px] text-fg-subtle">
            El mensaje se abre en el WhatsApp de {nombre} ({destino}).
          </p>
        )}
      </article>
    );
  }

  function bloque(
    titulo: string,
    lista: NotificationItem[],
    esDecision: boolean,
    vacio: string,
  ) {
    return (
      <section className="space-y-3">
        <header className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <span className="text-xs text-fg-subtle">
            {lista.length} {lista.length === 1 ? "pendiente" : "pendientes"}
          </span>
        </header>

        {lista.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-panel-1 p-4 text-sm text-fg-subtle">
            {vacio}
          </p>
        ) : (
          agrupar(lista).map((grupo) => (
            <div key={grupo.raffleId} className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-subtle">
                {tituloSorteo(grupo.raffleId)}
              </p>
              {grupo.items.map((item) => tarjeta(item, esDecision))}
            </div>
          ))
        )}
      </section>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {aviso && (
        <p className="rounded-md bg-emerald-500/10 p-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          {aviso}
        </p>
      )}

      {bloque(
        "Decisiones",
        decisiones,
        true,
        "No hay decisiones pendientes.",
      )}

      {bloque(
        "Avisos",
        avisos,
        false,
        "No hay avisos nuevos.",
      )}

      <section className="space-y-2 border-t border-hairline pt-4">
        <button
          type="button"
          onClick={() => setVerHistorial((v) => !v)}
          className="text-sm font-medium text-fg-subtle underline-offset-4 hover:underline"
        >
          {verHistorial ? "Ocultar historial" : `Ver historial (${historial.length})`}
        </button>

        {verHistorial &&
          (historial.length === 0 ? (
            <p className="text-sm text-fg-subtle">Todavía no hay historial.</p>
          ) : (
            <div className="space-y-2">{historial.map((item) => tarjeta(item, false))}</div>
          ))}
      </section>
    </div>
  );
}
