"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface WinnerCertificateProps {
  raffleTitle: string;
  winnerName: string;
  winnerNumber: number;
  drawnAt: string | null;
  verificationHash: string;
  verifyUrl: string;
  /** Ej. "1.er premio", "2.º premio". Si falta, certificado genérico. */
  prizeLabel?: string;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(" ");
  let line = "";
  let cursor = y;

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursor);
      cursor += lineHeight;
      line = word;
    } else {
      line = test;
    }
  }

  if (line) {
    ctx.fillText(line, x, cursor);
    cursor += lineHeight;
  }

  return cursor;
}

/**
 * Genera el certificado como PNG directamente en el navegador (HTML/CSS no
 * permite descargar un archivo; el canvas sí, sin dependencias).
 */
export function WinnerCertificate({
  raffleTitle,
  winnerName,
  winnerNumber,
  drawnAt,
  verificationHash,
  verifyUrl,
  prizeLabel,
}: WinnerCertificateProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function download() {
    setBusy(true);
    setError(null);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 820;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        setError("El navegador no pudo generar la imagen.");
        return;
      }

      const gradient = ctx.createLinearGradient(0, 0, 1200, 820);
      gradient.addColorStop(0, "#0b1220");
      gradient.addColorStop(1, "#3b1d07");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1200, 820);

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(60, 60, 1080, 700);

      ctx.fillStyle = "#b45309";
      ctx.font = "bold 22px Arial";
      ctx.fillText("GADU SORTEOS", 120, 140);

      ctx.fillStyle = "#111827";
      ctx.font = "bold 40px Arial";
      ctx.fillText(
        prizeLabel ? `Certificado · ${prizeLabel}` : "Certificado de ganador",
        120,
        210,
      );

      ctx.fillStyle = "#6b7280";
      ctx.font = "20px Arial";
      ctx.fillText("Se certifica que el número ganador del sorteo", 120, 260);

      ctx.fillStyle = "#111827";
      ctx.font = "bold 30px Arial";
      wrapText(ctx, raffleTitle, 120, 305, 960, 38);

      ctx.fillStyle = "#6b7280";
      ctx.font = "20px Arial";
      ctx.fillText("fue", 120, 390);

      ctx.fillStyle = "#b45309";
      ctx.font = "bold 96px Arial";
      ctx.fillText(String(winnerNumber).padStart(4, "0"), 120, 490);

      ctx.fillStyle = "#111827";
      ctx.font = "bold 26px Arial";
      ctx.fillText(`Ganador: ${winnerName}`, 120, 545);

      ctx.fillStyle = "#6b7280";
      ctx.font = "18px Arial";
      if (drawnAt) {
        ctx.fillText(`Fecha del sorteo: ${drawnAt}`, 120, 585);
      }

      ctx.fillStyle = "#374151";
      ctx.font = "14px monospace";
      ctx.fillText("Hash de verificación (SHA-256):", 120, 625);
      ctx.font = "13px monospace";
      wrapText(ctx, verificationHash, 120, 650, 960, 20);

      ctx.fillStyle = "#6b7280";
      ctx.font = "14px Arial";
      wrapText(ctx, `Verificable en: ${verifyUrl}`, 120, 705, 960, 20);

      const prizeSlug = (prizeLabel ?? "ganador")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();

      const link = document.createElement("a");
      link.download = `certificado-gadu-${prizeSlug}-${winnerNumber}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      setError("No se pudo generar el certificado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={download}
        disabled={busy}
        className="h-auto w-full whitespace-normal py-2 text-center sm:w-auto"
      >
        {busy ? (
          <Loader2 className="mr-1.5 h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <Download className="mr-1.5 h-4 w-4 shrink-0" />
        )}
        Descargar certificado{prizeLabel ? ` · ${prizeLabel}` : " (PNG)"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
