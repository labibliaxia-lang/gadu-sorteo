"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import {
  approveAccountDeletion,
  rejectAccountDeletion,
} from "@/app/[locale]/admin/super/bajas/actions";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

export interface BajaItem {
  id: string;
  nombre: string;
  email: string | null;
  requestedAt: string;
  reason: string | null;
  blockers: string[];
}

export function BajasList({ items }: { items: BajaItem[] }) {
  const t = useTranslations("AdminSuperBajas");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function aprobar(id: string) {
    const ok = window.confirm(t("confirmApprove"));
    if (!ok) return;

    setError(null);
    setAviso(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await approveAccountDeletion(id);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAviso(t("approvedNotice"));
      router.refresh();
    });
  }

  function rechazar(id: string) {
    const note = window.prompt(t("rejectPrompt"));
    if (note === null) return;

    setError(null);
    setAviso(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await rejectAccountDeletion(id, note);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAviso(t("rejectedNotice"));
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-hairline bg-panel-1 p-4 text-sm text-fg-subtle">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {aviso && (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{aviso}</p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {items.map((item) => {
        const trabado = item.blockers.length > 0;
        return (
          <article
            key={item.id}
            className="rounded-xl border border-hairline bg-panel-1 p-4 text-sm"
          >
            <p className="font-medium">
              {item.nombre}{" "}
              <span className="text-fg-subtle">
                · {item.email ?? t("noEmail")}
              </span>
            </p>
            <p className="mt-1 font-mono text-[11px] text-fg-subtle">
              {t("requestedAt", {
                date: formatDateTime(item.requestedAt, locale),
              })}
            </p>
            {item.reason && (
              <p className="mt-2 rounded-md bg-panel-2 p-2 text-xs">
                «{item.reason}»
              </p>
            )}

            {trabado ? (
              <ul className="mt-2 ml-4 list-disc text-xs text-destructive">
                {item.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-fg-subtle">
                {t("noBlockers")}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                onClick={() => aprobar(item.id)}
                disabled={trabado || pending}
              >
                {busyId === item.id ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : null}
                {t("approve")}
              </Button>
              <Button
                variant="outline"
                onClick={() => rechazar(item.id)}
                disabled={pending}
              >
                {t("reject")}
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
