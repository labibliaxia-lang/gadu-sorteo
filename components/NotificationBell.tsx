"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { toast } from "sonner";

import { marcarNotificacionLeida } from "@/app/notifications/actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface Notificacion {
  id: string;
  type: string;
  title: string | null;
  message: string | null;
  read_at: string | null;
  created_at: string;
  raffle_id: string | null;
}

/**
 * Campana global: últimas 10 notificaciones, badge de no leídas y toasts en
 * tiempo real para cualquier rol (jugador, organizador o superadmin).
 */
export function NotificationBell({ userId }: { userId: string | null }) {
  const supabase = createClient();
  const [items, setItems] = useState<Notificacion[]>([]);
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  const noLeidas = items.filter((item) => !item.read_at).length;

  const cargar = useCallback(async () => {
    if (!userId) return;

    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, message, read_at, created_at, raffle_id")
      .order("created_at", { ascending: false })
      .limit(10);

    setItems((data ?? []) as Notificacion[]);
  }, [supabase, userId]);

  useEffect(() => {
    void cargar();
    if (!userId) return;

    const canal = supabase
      .channel(`noti-bell-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const nueva = payload.new as Notificacion;
          toast(nueva.title ?? "Nueva notificación", {
            description: nueva.message ?? undefined,
          });
          void cargar();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => void cargar(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [userId, cargar, supabase]);

  useEffect(() => {
    function alClick(evento: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", alClick);
    return () => document.removeEventListener("mousedown", alClick);
  }, []);

  if (!userId) return null;

  async function leer(item: Notificacion) {
    if (item.read_at) return;
    await marcarNotificacionLeida(item.id);
    setItems((prev) =>
      prev.map((n) =>
        n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n,
      ),
    );
  }

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={`Notificaciones${noLeidas > 0 ? `: ${noLeidas} sin leer` : ""}`}
        aria-expanded={abierto}
        className="relative rounded-md px-2 py-2 text-fg-muted transition-colors hover:bg-panel-2 hover:text-fg"
      >
        <Bell className="h-4 w-4" />
        {noLeidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-hairline bg-background shadow-xl">
          <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
            <p className="text-sm font-semibold">Notificaciones</p>
            <Link
              href="/mis-numeros"
              onClick={() => setAbierto(false)}
              className="text-[11px] text-fg-subtle underline underline-offset-2"
            >
              Ver todo
            </Link>
          </div>

          {items.length === 0 ? (
            <p className="p-4 text-sm text-fg-subtle">No tenés notificaciones.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-hairline overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void leer(item)}
                    className={cn(
                      "flex w-full gap-2 px-3 py-2 text-left transition-colors hover:bg-panel-2",
                      !item.read_at && "bg-brand-500/5",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                        item.read_at ? "bg-transparent" : "bg-brand-500",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">
                        {item.title ?? "Aviso"}
                      </span>
                      {item.message && (
                        <span className="block text-xs text-fg-subtle">
                          {item.message}
                        </span>
                      )}
                      <span className="block text-[10px] text-fg-subtle">
                        {new Date(item.created_at).toLocaleString("es-AR", {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone: "America/Argentina/Buenos_Aires",
                        })}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
