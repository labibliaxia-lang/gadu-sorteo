/**
 * Denuncias de sorteos: vocabulario y normalización, sin dependencias de
 * servidor.
 *
 * Lo importan el flujo público (Server Action + botón cliente), la moderación
 * del panel y `lib/reports.test.ts`. Por eso el módulo es puro: nada de
 * `next/headers` ni de Supabase. Las etiquetas se usan en el navegador y las
 * validaciones corren en node (vitest).
 *
 * El contrato de valores espeja la migración 0064:
 *   reason  in ('fraude','premio_falso','contenido_inapropiado','spam','otro')
 *   status  in ('pending','resolved','dismissed')
 *   comment null o char_length(comment) <= 500
 */

import { UUID_RE } from "@/lib/superadmin";

/** Motivos permitidos. Allowlist: nunca texto libre (lo exige el CHECK de 0064). */
export const REPORT_REASONS = [
  "fraude",
  "premio_falso",
  "contenido_inapropiado",
  "spam",
  "otro",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/** Etiquetas en español para el select público y la pestaña de denuncias. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  fraude: "Posible fraude",
  premio_falso: "Premio falso o inexistente",
  contenido_inapropiado: "Contenido inapropiado",
  spam: "Spam",
  otro: "Otro",
};

/** Estados de moderación (los mismos del CHECK de `raffle_reports.status`). */
export const REPORT_STATUSES = ["pending", "resolved", "dismissed"] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "Pendiente",
  resolved: "Resuelta",
  dismissed: "Descartada",
};

/** Tope del comentario: espeja el CHECK de 0064 y el `maxLength` del textarea. */
export const REPORT_COMMENT_MAX_LENGTH = 500;

export type NormalizedReport = {
  raffleId: string;
  reason: ReportReason;
  comment: string | null;
};

export type NormalizeReportResult =
  | { ok: true; value: NormalizedReport }
  | { ok: false; error: string };

export function isReportReason(value: unknown): value is ReportReason {
  return (
    typeof value === "string" &&
    (REPORT_REASONS as readonly string[]).includes(value)
  );
}

export function isReportStatus(value: unknown): value is ReportStatus {
  return (
    typeof value === "string" &&
    (REPORT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Valida y normaliza lo que llega de un formulario o de un llamador no
 * confiable. Nunca lanza: devuelve un resultado con error legible.
 *
 * El comentario es opcional: se recorta y, si queda vacío, se guarda `null`
 * (el CHECK de la tabla acepta null, no cadena vacía "de relleno").
 */
export function normalizeReportInput(input: {
  raffleId: unknown;
  reason: unknown;
  comment: unknown;
}): NormalizeReportResult {
  const raffleId =
    typeof input?.raffleId === "string" ? input.raffleId.trim() : "";
  if (!UUID_RE.test(raffleId)) {
    return { ok: false, error: "El sorteo indicado no es válido." };
  }

  const reason = input?.reason;
  if (!isReportReason(reason)) {
    return { ok: false, error: "Elegí un motivo de denuncia." };
  }

  const rawComment = input?.comment;
  let comment: string | null = null;

  if (typeof rawComment === "string") {
    const trimmed = rawComment.trim();
    comment = trimmed.length > 0 ? trimmed : null;
  } else if (rawComment !== null && rawComment !== undefined) {
    return { ok: false, error: "El comentario no es válido." };
  }

  if (comment !== null && comment.length > REPORT_COMMENT_MAX_LENGTH) {
    return {
      ok: false,
      error: `El comentario no puede superar los ${REPORT_COMMENT_MAX_LENGTH} caracteres.`,
    };
  }

  return { ok: true, value: { raffleId, reason, comment } };
}

/**
 * Traduce el error crudo de PostgREST/Supabase a un mensaje que el usuario
 * entiende. Los dos casos esperables son el UNIQUE (ya denunció) y la policy
 * de RLS (sorteo inactivo o propio). El resto no filtra detalles internos.
 */
export function reportErrorMessage(
  code: string | undefined,
  message?: string,
): string {
  const raw = (message ?? "").toLowerCase();

  if (code === "23505" || raw.includes("duplicate key")) {
    return "Ya denunciaste este sorteo.";
  }

  if (code === "42501" || raw.includes("row-level security")) {
    return "No podés denunciar este sorteo (tiene que estar activo y no ser tuyo).";
  }

  return "No se pudo registrar la denuncia. Probá de nuevo.";
}
