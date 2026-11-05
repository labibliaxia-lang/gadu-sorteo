"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Loader2 } from "lucide-react";

import { checkLoginRateLimit } from "@/app/(auth)/login/actions";
import { acceptTerms } from "@/app/actions/terms";
import { Button } from "@/components/ui/button";
import { PASSKEYS_ENABLED } from "@/lib/flags";
import { createClient } from "@/lib/supabase/client";

/** Mensajes de error del acceso con llave de acceso. */
function passkeyLoginMessage(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("cancel") || m.includes("abort")) {
    return "Cancelaste el acceso. Probá de nuevo cuando quieras.";
  }
  if (m.includes("challenge_expired") || m.includes("expired")) {
    return "Pasó demasiado tiempo. Volvé a tocar el botón.";
  }
  if (
    m.includes("not enabled") ||
    m.includes("disabled") ||
    m.includes("not supported") ||
    m.includes("unsupported")
  ) {
    return "Este dispositivo no tiene una llave de acceso válida. Entrá con Google.";
  }
  if (m.includes("no credentials") || m.includes("not found")) {
    return "No encontramos ninguna llave registrada para este sitio. Entrá con Google.";
  }
  return "No pudimos completar el acceso con llave. Entrá con Google o intentá de nuevo.";
}

/**
 * Acceso con llave de acceso (WebAuthn).
 *
 * Se renderiza completo —separador incluido— o no se renderiza: el flag y el
 * soporte del navegador apagan la sección entera, para no ofrecer una opción
 * que no puede terminar en una sesión.
 *
 * La ceremonia corre en el navegador contra Supabase Auth; el cliente de
 * `@supabase/ssr` deja la sesión en cookies, así que el servidor la ve en la
 * siguiente petición.
 */
export function PasskeyLoginButton({
  next,
  termsAccepted = true,
}: {
  next?: string | null;
  termsAccepted?: boolean;
}) {
  const supabase = createClient();
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // WebAuthn solo existe en contexto seguro: HTTPS o localhost.
    setSupported(
      typeof window !== "undefined" &&
        typeof window.PublicKeyCredential !== "undefined",
    );
  }, []);

  if (!PASSKEYS_ENABLED || !supported) return null;

  function safeNext(): string | null {
    if (!next) return null;
    return next.startsWith("/") && !next.startsWith("//") ? next : null;
  }

  async function handleSignIn() {
    if (!termsAccepted || loading) return;
    setLoading(true);
    setError(null);

    // Mismo límite perimetral que el camino de Google: 5 intentos/15 min por IP.
    const gate = await checkLoginRateLimit();
    if (!gate.ok) {
      setError(gate.error);
      setLoading(false);
      return;
    }

    try {
      const { error: signInError } = await supabase.auth.signInWithPasskey();

      if (signInError) {
        setError(passkeyLoginMessage(signInError.message));
        setLoading(false);
        return;
      }

      // Este camino no pasa por /auth/callback, así que la aceptación de los
      // términos se registra acá. Si falla, el TermsGate igual la pide.
      if (termsAccepted) {
        try {
          await acceptTerms();
        } catch {
          // Sin bloqueo: la aceptación se puede completar después.
        }
      }

      window.location.assign(safeNext() ?? "/");
    } catch (unexpected) {
      setError(
        unexpected instanceof Error
          ? unexpected.message
          : "No pudimos completar el acceso con llave.",
      );
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        o
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={() => void handleSignIn()}
        disabled={loading || !termsAccepted}
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Fingerprint className="mr-2 h-4 w-4" />
        )}
        {loading ? "Esperando al dispositivo…" : "Entrar con llave de acceso"}
      </Button>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
