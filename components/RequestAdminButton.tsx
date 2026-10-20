"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function RequestAdminButton() {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request() {
    const confirmed = window.confirm(
      "¿Querés solicitar ser Administrador/Organizador? Un superadministrador revisará tu pedido.",
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("No estás autenticado.");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ role_requested: true, role_request_status: "pending" })
      .eq("id", user.id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setDone(true);
    setLoading(false);
  }

  if (done) {
    return (
      <p className="max-w-[220px] text-xs text-emerald-600 dark:text-emerald-400">
        ✓ ¡Solicitud enviada con éxito! El superadministrador la revisará
        pronto.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={request}
        disabled={loading}
      >
        <ShieldCheck className="mr-1.5 h-4 w-4" />
        {loading ? "Enviando…" : "Solicitar ser Administrador"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
