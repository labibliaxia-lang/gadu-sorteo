"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type RequestStatus = "none" | "pending" | "approved" | "rejected";

export function RequestAdminButton() {
  const supabase = createClient();
  const [status, setStatus] = useState<RequestStatus | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (active) setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("role, admin_request_status")
        .eq("id", user.id)
        .maybeSingle();

      if (active) {
        setIsAdmin(data?.role === "admin" || data?.role === "superadmin");
        setStatus(data?.admin_request_status ?? "none");
        setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [supabase]);

  async function request() {
    const confirmed = window.confirm(
      "¿Querés solicitar ser Organizador? Un superadmin revisará tu pedido.",
    );
    if (!confirmed) return;

    setSubmitting(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("No estás autenticado.");
      setSubmitting(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        role_requested: true,
        role_request_status: "pending",
        admin_request_status: "pending",
      })
      .eq("id", user.id);

    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    setStatus("pending");
    setSubmitting(false);
  }

  if (loading) return null;

  if (isAdmin || status === "approved") {
    return (
      <p className="text-sm text-emerald-600 dark:text-emerald-400">
        ✓ Ya sos organizador.
      </p>
    );
  }

  if (status === "pending") {
    return (
      <div className="space-y-2">
        <Button variant="outline" size="sm" disabled>
          <ShieldCheck className="mr-1.5 h-4 w-4" />
          Solicitud enviada
        </Button>
        <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          Tu solicitud está pendiente de revisión por el Superadmin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        size="sm"
        onClick={request}
        disabled={submitting}
      >
        <ShieldCheck className="mr-1.5 h-4 w-4" />
        {submitting ? "Enviando…" : "Solicitar ser Organizador"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
