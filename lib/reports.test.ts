import { describe, expect, it } from "vitest";

import {
  REPORT_COMMENT_MAX_LENGTH,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  REPORT_STATUS_LABELS,
  REPORT_STATUSES,
  isReportReason,
  isReportStatus,
  normalizeReportInput,
  reportErrorMessage,
} from "./reports";

const UUID = "3f1c2a9e-1b2c-4d5e-8f90-1234567890ab";

describe("allowlist de motivos", () => {
  it("expone exactamente los valores del CHECK de la migración 0064", () => {
    expect(REPORT_REASONS).toEqual([
      "fraude",
      "premio_falso",
      "contenido_inapropiado",
      "spam",
      "otro",
    ]);
  });

  it("tiene una etiqueta en español para cada motivo", () => {
    for (const reason of REPORT_REASONS) {
      expect(REPORT_REASON_LABELS[reason]).toBeTruthy();
    }
    expect(REPORT_REASON_LABELS.fraude).toBe("Posible fraude");
    expect(REPORT_REASON_LABELS.premio_falso).toBe("Premio falso o inexistente");
  });

  it("rechaza cualquier valor fuera de la allowlist", () => {
    expect(isReportReason("fraude")).toBe(true);
    expect(isReportReason("FRAUDE")).toBe(false);
    expect(isReportReason("estafa")).toBe(false);
    expect(isReportReason("")).toBe(false);
    expect(isReportReason(null)).toBe(false);
    expect(isReportReason(42)).toBe(false);
  });
});

describe("estados de denuncia", () => {
  it("mapea los tres estados del CHECK a etiquetas legibles", () => {
    expect(REPORT_STATUSES).toEqual(["pending", "resolved", "dismissed"]);
    expect(REPORT_STATUS_LABELS.pending).toBe("Pendiente");
    expect(REPORT_STATUS_LABELS.resolved).toBe("Resuelta");
    expect(REPORT_STATUS_LABELS.dismissed).toBe("Descartada");
  });

  it("valida estados con la allowlist", () => {
    expect(isReportStatus("resolved")).toBe(true);
    expect(isReportStatus("aprobada")).toBe(false);
    expect(isReportStatus(undefined)).toBe(false);
  });
});

describe("normalizeReportInput", () => {
  it("acepta una denuncia válida y recorta el comentario", () => {
    const result = normalizeReportInput({
      raffleId: ` ${UUID} `,
      reason: "fraude",
      comment: "  Nunca entregó el premio.  ",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        raffleId: UUID,
        reason: "fraude",
        comment: "Nunca entregó el premio.",
      },
    });
  });

  it("acepta un UUID en mayúsculas", () => {
    const result = normalizeReportInput({
      raffleId: UUID.toUpperCase(),
      reason: "otro",
      comment: null,
    });
    expect(result.ok).toBe(true);
  });

  it("convierte comentario vacío o solo espacios en null", () => {
    for (const comment of ["", "   ", "\n\t "]) {
      const result = normalizeReportInput({
        raffleId: UUID,
        reason: "spam",
        comment,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.comment).toBeNull();
    }
  });

  it("trata el comentario ausente o null como opcional", () => {
    const withoutComment = normalizeReportInput({
      raffleId: UUID,
      reason: "spam",
      comment: undefined,
    });
    expect(withoutComment.ok).toBe(true);
    if (withoutComment.ok) expect(withoutComment.value.comment).toBeNull();

    const withNull = normalizeReportInput({
      raffleId: UUID,
      reason: "spam",
      comment: null,
    });
    expect(withNull.ok).toBe(true);
    if (withNull.ok) expect(withNull.value.comment).toBeNull();
  });

  it(`acepta un comentario de exactamente ${REPORT_COMMENT_MAX_LENGTH} caracteres`, () => {
    const result = normalizeReportInput({
      raffleId: UUID,
      reason: "otro",
      comment: "a".repeat(REPORT_COMMENT_MAX_LENGTH),
    });
    expect(result.ok).toBe(true);
  });

  it("rechaza un comentario de más de 500 caracteres", () => {
    const result = normalizeReportInput({
      raffleId: UUID,
      reason: "otro",
      comment: "a".repeat(REPORT_COMMENT_MAX_LENGTH + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("500");
  });

  it("rechaza un motivo fuera de la allowlist", () => {
    const result = normalizeReportInput({
      raffleId: UUID,
      reason: "estafa",
      comment: null,
    });
    expect(result).toEqual({
      ok: false,
      error: "Elegí un motivo de denuncia.",
    });
  });

  it("rechaza un motivo ausente", () => {
    const result = normalizeReportInput({
      raffleId: UUID,
      reason: undefined,
      comment: null,
    });
    expect(result.ok).toBe(false);
  });

  it("rechaza un UUID inválido", () => {
    for (const raffleId of ["", "no-es-uuid", "123", null, 7]) {
      const result = normalizeReportInput({
        raffleId,
        reason: "fraude",
        comment: null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("sorteo");
    }
  });

  it("rechaza un comentario que no es texto", () => {
    const result = normalizeReportInput({
      raffleId: UUID,
      reason: "fraude",
      comment: 123,
    });
    expect(result.ok).toBe(false);
  });
});

describe("reportErrorMessage", () => {
  it("explica el UNIQUE con el código 23505", () => {
    expect(reportErrorMessage("23505")).toBe("Ya denunciaste este sorteo.");
  });

  it("también reconoce el duplicado por el texto del error", () => {
    expect(
      reportErrorMessage(
        undefined,
        'duplicate key value violates unique constraint "raffle_reports_unique_reporter"',
      ),
    ).toBe("Ya denunciaste este sorteo.");
  });

  it("explica la denegación de RLS con el código 42501", () => {
    expect(reportErrorMessage("42501")).toBe(
      "No podés denunciar este sorteo (tiene que estar activo y no ser tuyo).",
    );
  });

  it("también reconoce la policy por el texto del error", () => {
    expect(
      reportErrorMessage(
        "42501",
        'new row violates row-level security policy for table "raffle_reports"',
      ),
    ).toBe(
      "No podés denunciar este sorteo (tiene que estar activo y no ser tuyo).",
    );
  });

  it("el duplicado gana si el mensaje menciona ambas cosas", () => {
    expect(
      reportErrorMessage("23505", "duplicate key ... row-level security"),
    ).toBe("Ya denunciaste este sorteo.");
  });

  it("cae en un mensaje genérico para cualquier otro error", () => {
    expect(reportErrorMessage("XX000", "connection reset")).toBe(
      "No se pudo registrar la denuncia. Probá de nuevo.",
    );
    expect(reportErrorMessage(undefined)).toBe(
      "No se pudo registrar la denuncia. Probá de nuevo.",
    );
  });
});
