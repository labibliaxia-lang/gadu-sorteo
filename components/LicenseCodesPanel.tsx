"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Loader2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { generateLicenseCode } from "@/app/admin/super/actions";

interface LicenseCode {
  code: string;
  plan: string;
  status: string;
  created_at: string;
  redeemed_at: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  active: "Disponible",
  redeemed: "Canjeado",
  revoked: "Revocado",
};

const STATUS_VARIANT: Record<
  string,
  "success" | "secondary" | "destructive"
> = {
  active: "success",
  redeemed: "secondary",
  revoked: "destructive",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LicenseCodesPanel({ codes }: { codes: LicenseCode[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    setGenerated(null);
    setCopied(false);
    const res = await generateLicenseCode();
    if (!res.ok) setError(res.error ?? "Error al generar el código");
    else setGenerated(res.code ?? null);
    setBusy(false);
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el usuario puede seleccionar el texto.
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleGenerate} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-4 w-4" />
          )}
          Generar código
        </Button>
        <p className="text-sm text-muted-foreground">
          25 caracteres: mayúsculas, minúsculas, números y símbolos.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {generated && (
        <div className="rounded-xl border bg-muted/40 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Código generado
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded-lg border bg-background px-3 py-2 font-mono text-base font-bold tracking-wide">
              {generated}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyCode(generated)}
            >
              {copied ? (
                <Check className="mr-1.5 h-4 w-4" />
              ) : (
                <Copy className="mr-1.5 h-4 w-4" />
              )}
              {copied ? "¡Copiado!" : "Copiar"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Guardalo ahora: se muestra una sola vez.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Código</th>
              <th className="p-3">Plan</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Creado</th>
              <th className="p-3">Canjeado</th>
            </tr>
          </thead>
          <tbody>
            {codes.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="p-6 text-center text-muted-foreground"
                >
                  Todavía no hay códigos. Generá el primero.
                </td>
              </tr>
            ) : (
              codes.map((c) => (
                <tr key={c.code} className="border-t">
                  <td className="p-3">
                    <code className="break-all font-mono text-xs">
                      {c.code}
                    </code>
                  </td>
                  <td className="p-3 capitalize">{c.plan}</td>
                  <td className="p-3">
                    <Badge
                      variant={STATUS_VARIANT[c.status] ?? "secondary"}
                    >
                      {STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {formatDate(c.created_at)}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {formatDate(c.redeemed_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <KeyRound className="h-3.5 w-3.5" />
        Ruta pública de canje: <code className="font-mono">/planes</code>
      </p>
    </div>
  );
}
