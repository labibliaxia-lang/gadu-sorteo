"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export interface TotpFactorSummary {
  id: string;
  friendlyName: string | null;
  verified: boolean;
}

interface PendingEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

/** Traduce los errores de Supabase MFA sin filtrar detalles internos. */
function mfaErrorMessage(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("cancel") || m.includes("abortado")) {
    return "Cancelaste la verificación. Probá de nuevo.";
  }
  if (m.includes("invalid") || m.includes("incorrect")) {
    return "El código no es válido. Revisá la app autenticadora y volvé a intentar.";
  }
  if (m.includes("expired")) {
    return "El código venció. Generá uno nuevo en tu app autenticadora.";
  }
  if (
    m.includes("not enabled") ||
    m.includes("disabled") ||
    m.includes("not supported")
  ) {
    return "El proyecto no tiene el segundo factor habilitado. Activalo en Supabase (Authentication → Multi-Factor Auth).";
  }
  return message;
}

/**
 * Segundo factor (TOTP) del usuario.
 *
 * El panel no valida nada por sí solo: solo dispara `enroll` y
 * `challengeAndVerify`, y Supabase emite un token nuevo con `aal2`. La
 * autorización real vive en `lib/auth.ts` y en `app/admin/layout.tsx`, que
 * vuelven a leer el nivel de garantía en cada petición.
 */
export function MfaPanel({
  factors,
  currentLevel,
  required,
}: {
  factors: TotpFactorSummary[];
  currentLevel: string | null;
  required: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<PendingEnrollment | null>(null);
  const [code, setCode] = useState("");

  const verified = factors.filter((factor) => factor.verified);
  const pending = factors.filter((factor) => !factor.verified);
  const isAal2 = currentLevel === "aal2";

  async function startEnrollment() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Gadu ${new Date().toISOString().slice(0, 10)}`,
      });

      if (enrollError) {
        setError(mfaErrorMessage(enrollError.message));
        return;
      }
      if (!data || data.type !== "totp" || !("totp" in data)) {
        setError("No pudimos generar el código de activación.");
        return;
      }

      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setCode("");
    } catch (unexpected) {
      setError(
        mfaErrorMessage(
          unexpected instanceof Error ? unexpected.message : String(unexpected),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(factorId: string) {
    const clean = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(clean)) {
      setError("El código tiene 6 dígitos.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const { error: verifyError } =
        await supabase.auth.mfa.challengeAndVerify({
          factorId,
          code: clean,
        });

      if (verifyError) {
        setError(mfaErrorMessage(verifyError.message));
        return;
      }

      setEnrollment(null);
      setCode("");
      setNotice("Segundo factor activo en esta sesión.");
      router.refresh();
    } catch (unexpected) {
      setError(
        mfaErrorMessage(
          unexpected instanceof Error ? unexpected.message : String(unexpected),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeFactor(factorId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId,
      });

      if (unenrollError) {
        setError(mfaErrorMessage(unenrollError.message));
        return;
      }

      setNotice("Segundo factor desactivado.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">Segundo factor (app autenticadora)</p>
              {isAal2 ? (
                <Badge variant="success">Verificado</Badge>
              ) : verified.length > 0 ? (
                <Badge variant="warning">Falta verificar</Badge>
              ) : (
                <Badge variant="outline">Sin activar</Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Además de entrar con Google, te pedimos un código de 6 dígitos de
              una app como Google Authenticator, Authy o 1Password. Si alguien
              consigue tu cuenta de Google, sin ese código no entra.
            </p>

            {required && !isAal2 && (
              <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200">
                El panel de administración exige este paso: hasta que lo
                verifiques, no vas a poder entrar a /admin.
              </p>
            )}

            {verified.length > 0 && !isAal2 && !enrollment && (
              <div className="space-y-2">
                <p className="text-sm">
                  Escribí el código actual de tu app autenticadora.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    className="w-32 font-mono tracking-[0.3em]"
                    aria-label="Código de 6 dígitos"
                  />
                  <Button
                    onClick={() => void confirmCode(verified[0].id)}
                    disabled={busy}
                  >
                    {busy ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : null}
                    Verificar
                  </Button>
                </div>
              </div>
            )}

            {verified.length === 0 && !enrollment && (
              <Button onClick={() => void startEnrollment()} disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-1.5 h-4 w-4" />
                )}
                Activar segundo factor
              </Button>
            )}

            {enrollment && (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                <p className="text-sm font-medium">
                  1. Escaneá el código con tu app autenticadora
                </p>
                {/* El SVG lo genera Supabase; se muestra como imagen de datos
                    para no inyectar markup en el DOM. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/svg+xml;utf-8,${encodeURIComponent(enrollment.qrCode)}`}
                  alt="Código QR para la app autenticadora"
                  width={160}
                  height={160}
                  className="rounded-md bg-white p-2"
                />
                <p className="text-xs text-muted-foreground">
                  ¿No podés escanear? Cargá esta clave a mano:{" "}
                  <code className="break-all font-mono text-foreground">
                    {enrollment.secret}
                  </code>
                </p>

                <p className="text-sm font-medium">
                  2. Escribí el código que muestra la app
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    className="w-32 font-mono tracking-[0.3em]"
                    aria-label="Código de 6 dígitos"
                  />
                  <Button
                    onClick={() => void confirmCode(enrollment.factorId)}
                    disabled={busy}
                  >
                    {busy ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : null}
                    Activar
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEnrollment(null);
                      setCode("");
                      setError(null);
                    }}
                    disabled={busy}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {pending.length > 0 && !enrollment && (
              <p className="text-xs text-muted-foreground">
                Tenés {pending.length} activación(es) a medio terminar.{" "}
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => void removeFactor(pending[0].id)}
                  disabled={busy}
                >
                  Descartar la pendiente
                </button>
              </p>
            )}

            {verified.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Fecha de alta:{" "}
                {verified[0].friendlyName ?? "sin nombre"}.{" "}
                <button
                  type="button"
                  className="text-destructive underline underline-offset-4"
                  onClick={() => void removeFactor(verified[0].id)}
                  disabled={busy}
                >
                  Desactivar segundo factor
                </button>
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
