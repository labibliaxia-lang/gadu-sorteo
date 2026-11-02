"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redeemLicenseCode } from "@/app/planes/actions";

const CODE_LENGTH = 25;

export function RedeemCodeForm() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    plan?: string | null;
    message: string;
  } | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = code.trim();
    if (!value || busy) return;

    setBusy(true);
    setResult(null);

    const formData = new FormData();
    formData.set("code", value);
    const res = await redeemLicenseCode(formData);

    setResult(res);
    if (res.ok) setCode("");
    setBusy(false);
  }

  const trimmed = code.trim();

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="license-code">Código de activación</Label>
          <span className="font-mono text-xs text-muted-foreground">
            {trimmed.length}/{CODE_LENGTH}
          </span>
        </div>

        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="license-code"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value.slice(0, CODE_LENGTH))}
            maxLength={CODE_LENGTH}
            placeholder="Ej: G7#k9Xm2P!qZ8#v4Lw3Yx$p7A9"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="pl-9 text-center font-mono tracking-wider"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          25 caracteres. Distingue mayúsculas, minúsculas, números y símbolos.
        </p>
      </div>

      {result && (
        <div
          role="status"
          className={
            result.ok
              ? "flex items-start gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"
              : "flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          }
        >
          {result.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>
            {result.message}
            {result.ok && result.plan ? (
              <span className="block text-xs opacity-80">
                Plan activado: {result.plan}
              </span>
            ) : null}
          </span>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={busy || !trimmed}>
        {busy ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <KeyRound className="mr-1.5 h-4 w-4" />
        )}
        Canjear código
      </Button>
    </form>
  );
}
