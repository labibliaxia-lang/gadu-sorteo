"use client";

import { useEffect, useState } from "react";
import { Phone, ShieldCheck, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type RequestStatus = "none" | "pending" | "approved" | "rejected";

export function RequestAdminButton() {
  const supabase = createClient();
  const [status, setStatus] = useState<RequestStatus | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

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
        .select("role, admin_request_status, phone")
        .eq("id", user.id)
        .maybeSingle();

      if (active) {
        setIsAdmin(data?.role === "admin" || data?.role === "superadmin");
        setStatus(data?.admin_request_status ?? "none");
        setPhone(data?.phone ?? "");
        setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [supabase]);

  async function submitRequest() {
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
        phone: phone || null,
        request_message: message || null,
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
    setOpen(false);
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
    <>
      <div className="space-y-1">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <ShieldCheck className="mr-1.5 h-4 w-4" />
          Solicitar ser Organizador
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-card p-4 shadow-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold">
                  Solicitar ser Organizador
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Dejanos tu WhatsApp y una propuesta para negociar comisiones
                  y condiciones.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="wa">Teléfono / WhatsApp</Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="wa"
                    className="pl-9"
                    placeholder="Ej: 5491123456789"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="msg">Mensaje / Propuesta (opcional)</Label>
                <Textarea
                  id="msg"
                  rows={3}
                  placeholder="Contá qué querés sortear, comisiones, etc."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <Button
                type="button"
                className="w-full"
                onClick={submitRequest}
                disabled={submitting}
              >
                {submitting ? "Enviando…" : "Enviar solicitud"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
