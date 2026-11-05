"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";

import { cancelAccountDeletion, requestAccountDeletion } from "@/app/perfil/deletion-actions";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { STATUS_LABELS, type DeletionStatus } from "@/lib/account-deletion";

type Fila = { status: DeletionStatus; requested_at: string };

/**
 * Baja de cuenta: pedirla y cancelarla.
 *
 * No ejecuta el borrado: eso lo aprueba el superadmin. Acá solo se registra la
 * intención, y se avisa por qué todavía no se puede.
 */
export function AccountDeletionPanel() {
  const supabase = createClient();
  const [cargando, setCargando] = useState(true);
  const [solicitud, setSolicitud] = useState<Fila | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bloqueos, setBloqueos] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  async function cargar() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSolicitud(null);
      setCargando(false);
      return;
    }

    const { data } = await supabase
      .from("account_deletion_requests")
      .select("status, requested_at")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(1);

    const fila = (data?.[0] as Fila | undefined) ?? null;
    setSolicitud(fila && fila.status === "pending" ? fila : null);
    setCargando(false);
  }

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pedir() {
    setBusy(true);
    setError(null);
    setBloqueos([]);
    const result = await requestAccountDeletion();
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      setBloqueos(result.blockers ?? []);
      return;
    }

    setConfirmando(false);
    setAviso("Solicitud registrada. Te contactamos para confirmarla.");
    await cargar();
  }

  async function cancelar() {
    setBusy(true);
    setError(null);
    const result = await cancelAccountDeletion();
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAviso("La solicitud quedó cancelada.");
    await cargar();
  }

  if (cargando) return null;

  return (
    <section className="rounded-xl border border-hairline bg-panel-1 p-5">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-fg-subtle" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="font-semibold">Baja de cuenta</h2>

          {solicitud ? (
            <>
              <p className="text-sm text-fg-subtle">
                Tu solicitud está <strong>{STATUS_LABELS[solicitud.status].toLowerCase()}</strong>{" "}
                desde el{" "}
                {new Date(solicitud.requested_at).toLocaleDateString("es-AR", {
                  timeZone: "America/Argentina/Buenos_Aires",
                })}
                . Se resuelve en hasta 10 días hábiles.
              </p>
              <Button variant="outline" onClick={() => void cancelar()} disabled={busy}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Cancelar la solicitud
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-fg-subtle">
                Si pedís la baja, eliminamos tus datos personales y tus documentos de
                identidad. Tus pagos y devoluciones quedan registrados, sin tu nombre,
                por obligación contable.
              </p>

              {!confirmando ? (
                <Button variant="outline" onClick={() => setConfirmando(true)}>
                  Pedir la baja de mi cuenta
                </Button>
              ) : (
                <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                  <p className="text-sm">
                    <strong>Esto no se puede deshacer.</strong> ¿Confirmás que querés pedir
                    la baja?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void pedir()} disabled={busy}>
                      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                      Sí, pedir la baja
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setConfirmando(false)}
                      disabled={busy}
                    >
                      No, dejarlo
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {aviso && (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{aviso}</p>
          )}

          {error && (
            <div role="alert" className="space-y-1 rounded-md bg-destructive/10 p-2">
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {error}
              </p>
              {bloqueos.length > 0 && (
                <ul className="ml-4 list-disc text-xs text-destructive">
                  {bloqueos.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
