"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Loader2, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PASSKEYS_ENABLED } from "@/lib/flags";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";

interface PasskeyItem {
  id: string;
  friendlyName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Mensajes claros para los errores habituales de WebAuthn. */
function passkeyErrorMessage(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("cancel") || m.includes("abort") || m.includes("notallowed")) {
    return "Cancelaste el proceso. Podés volver a intentar cuando quieras.";
  }
  if (m.includes("timeout")) {
    return "Se agotó el tiempo de espera. Probá de nuevo.";
  }
  if (
    m.includes("not enabled") ||
    m.includes("disabled") ||
    m.includes("not supported") ||
    m.includes("unsupported")
  ) {
    return "Las llaves de acceso todavía no están habilitadas. Avisale al equipo de Gadu.";
  }
  if (m.includes("already") || m.includes("exists")) {
    return "Ese dispositivo ya tiene una llave registrada en tu cuenta.";
  }
  return message;
}

/**
 * Llaves de acceso (passkeys).
 *
 * Solo se muestra si `NEXT_PUBLIC_PASSKEYS_ENABLED=true`: la ceremonia ocurre
 * entera en el navegador contra Supabase Auth, así que el flag es lo único que
 * evita ofrecer un botón que el proyecto todavía no puede completar.
 */
export function PasskeysPanel() {
  const supabase = createClient();

  const [supported, setSupported] = useState(false);
  const [items, setItems] = useState<PasskeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // WebAuthn necesita un contexto seguro (HTTPS o localhost).
    setSupported(
      typeof window !== "undefined" &&
        typeof window.PublicKeyCredential !== "undefined",
    );
  }, []);

  async function refresh() {
    try {
      const { data, error: listError } = await supabase.auth.passkey.list();

      if (listError) {
        setError(passkeyErrorMessage(listError.message));
        return;
      }

      setItems(
        (data ?? []).map((item) => ({
          id: item.id,
          friendlyName: item.friendly_name ?? null,
          createdAt: item.created_at,
          lastUsedAt: item.last_used_at ?? null,
        })),
      );
    } catch (unexpected) {
      setError(
        passkeyErrorMessage(
          unexpected instanceof Error ? unexpected.message : String(unexpected),
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!PASSKEYS_ENABLED) {
      setLoading(false);
      return;
    }
    void refresh();
    // `supabase` se recrea en cada render; el listado se pide una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  if (!PASSKEYS_ENABLED) return null;

  async function addPasskey() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const { error: registerError } = await supabase.auth.registerPasskey();

      if (registerError) {
        setError(passkeyErrorMessage(registerError.message));
        return;
      }

      setNotice("Listo: ya podés entrar con este dispositivo.");
      await refresh();
    } catch (unexpected) {
      setError(
        passkeyErrorMessage(
          unexpected instanceof Error ? unexpected.message : String(unexpected),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(passkeyId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const { error: deleteError } = await supabase.auth.passkey.delete({
        passkeyId,
      });

      if (deleteError) {
        setError(passkeyErrorMessage(deleteError.message));
        return;
      }

      setNotice("Llave eliminada. Ese dispositivo ya no puede entrar.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start gap-2">
          <Fingerprint className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">Llaves de acceso</p>
              {items.length > 0 ? (
                <Badge variant="success">
                  {items.length} registrada{items.length === 1 ? "" : "s"}
                </Badge>
              ) : (
                <Badge variant="outline">Sin registrar</Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Entrá con la huella, la cara o el PIN de este dispositivo, sin
              escribir nada. Las llaves no se pueden reutilizar en un sitio
              falso, así que el phishing deja de funcionar.
            </p>

            {!supported && (
              <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200">
                Este navegador no admite llaves de acceso. Podés seguir entrando
                con Google.
              </p>
            )}

            {supported && (
              <Button onClick={() => void addPasskey()} disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-4 w-4" />
                )}
                Agregar este dispositivo
              </Button>
            )}

            {loading ? (
              <p className="text-xs text-muted-foreground">Cargando…</p>
            ) : items.length > 0 ? (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {item.friendlyName ?? "Dispositivo sin nombre"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Alta: {formatDateTime(item.createdAt)}
                        {item.lastUsedAt
                          ? ` · Último uso: ${formatDateTime(item.lastUsedAt)}`
                          : " · Todavía sin usar"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void removePasskey(item.id)}
                      disabled={busy}
                      aria-label={`Eliminar ${
                        item.friendlyName ?? "la llave"
                      }`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Todavía no registraste ninguna llave. Google sigue funcionando
                como forma de entrar y de recuperar la cuenta.
              </p>
            )}

            {notice && (
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {notice}
              </p>
            )}
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
