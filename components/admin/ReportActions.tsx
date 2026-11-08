"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  EyeOff,
  Loader2,
  PauseCircle,
  Trash2,
} from "lucide-react";

import {
  deleteReport,
  pauseReportedRaffle,
  resolveReport,
  type ReportActionResult,
} from "@/app/[locale]/admin/super/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  isReportReason,
  isReportStatus,
} from "@/lib/reports";
import { formatDateTime } from "@/lib/utils";

/** Contrato exacto que consume la pestaña Denuncias del panel. */
export interface ReportRow {
  id: string;
  raffleId: string;
  raffleTitle: string;
  raffleStatus: string;
  reporterEmail: string | null;
  reason: string;
  comment: string | null;
  status: string;
  createdAt: string;
}

function reasonText(reason: string): string {
  return isReportReason(reason) ? REPORT_REASON_LABELS[reason] : reason;
}

function statusText(status: string): string {
  return isReportStatus(status) ? REPORT_STATUS_LABELS[status] : status;
}

function statusVariant(status: string): "warning" | "success" | "secondary" {
  if (status === "resolved") return "success";
  if (status === "dismissed") return "secondary";
  return "warning";
}

/**
 * Acciones de moderación de una denuncia: resolver, descartar, pausar el
 * sorteo (cerrar la venta) o eliminar la denuncia.
 *
 * Cada acción confirma antes de ejecutarse y, si sale bien, refresca el árbol
 * de Server Components (`router.refresh()`) para que la lista se actualice sin
 * recargar. Los permisos y la auditoría viven en las Server Actions
 * (`resolveReport`, `pauseReportedRaffle`, `deleteReport`): este componente no
 * decide nada por su cuenta.
 */
export function ReportActions({ report }: { report: ReportRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const working = busy !== null;
  const canPause = report.raffleStatus === "active";

  async function run(
    key: string,
    confirmation: string,
    action: () => Promise<ReportActionResult>,
  ) {
    if (!window.confirm(confirmation)) return;

    setBusy(key);
    setError(null);
    setMessage(null);

    const result = await action();

    setBusy(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMessage(result.message ?? "Listo.");
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-lg border border-hairline bg-panel-1/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{reasonText(report.reason)}</p>
        <Badge variant={statusVariant(report.status)}>
          {statusText(report.status)}
        </Badge>
      </div>

      <p className="text-[13px] text-fg-subtle">
        Sorteo:{" "}
        <a
          href={`/sorteos/${report.raffleId}`}
          className="text-brand-800 underline-offset-4 hover:underline dark:text-brand-300"
        >
          {report.raffleTitle}
        </a>{" "}
        <span className="font-mono text-[11px] uppercase tracking-[0.06em]">
          · {report.raffleStatus}
        </span>
      </p>

      <p className="text-xs text-fg-subtle">
        Denunciante: {report.reporterEmail ?? "sin email visible"} ·{" "}
        {formatDateTime(report.createdAt)}
      </p>

      {report.comment && (
        <p className="whitespace-pre-line rounded-md border-l-2 border-brand-500/40 bg-panel-2/60 p-2 text-[13px] text-fg-subtle">
          {report.comment}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="button"
          variant="success"
          size="sm"
          disabled={working}
          onClick={() =>
            void run(
              "resolved",
              "¿Marcar esta denuncia como resuelta?",
              () => resolveReport(report.id, "resolved"),
            )
          }
        >
          {busy === "resolved" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          )}
          Resolver
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={working}
          onClick={() =>
            void run(
              "dismissed",
              "¿Descartar esta denuncia?",
              () => resolveReport(report.id, "dismissed"),
            )
          }
        >
          {busy === "dismissed" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <EyeOff className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          )}
          Descartar
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={working || !canPause}
          title={
            canPause
              ? "Cierra la venta de números (no toca pagos ni reservas)."
              : "El sorteo ya no está activo."
          }
          onClick={() =>
            void run(
              "pause",
              "¿Pausar el sorteo? Se cierra la venta de números. No se tocan pagos, reservas ni el resultado; las devoluciones siguen siendo manuales.",
              () => pauseReportedRaffle(report.id),
            )
          }
        >
          {busy === "pause" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <PauseCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          )}
          Pausar sorteo
        </Button>

        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={working}
          onClick={() =>
            void run(
              "delete",
              "¿Eliminar esta denuncia? La acción no se puede deshacer.",
              () => deleteReport(report.id),
            )
          }
        >
          {busy === "delete" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          )}
          Eliminar
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-300">
          {message}
        </p>
      )}
    </div>
  );
}
