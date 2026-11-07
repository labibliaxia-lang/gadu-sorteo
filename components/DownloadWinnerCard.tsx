"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Genera en el navegador una tarjeta PNG del ganador para subir a redes.
 * Todo ocurre en el cliente: no hay endpoint ni escritura en base.
 */
export function DownloadWinnerCard({
  title,
  winnerName,
  winnerNumber,
}: {
  title: string;
  winnerName: string | null;
  winnerNumber: number;
}) {
  function nombreCorto(fullName: string | null): string {
    const partes = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return "Ganador";
    if (partes.length === 1) return partes[0];
    return `${partes[0]} ${partes[partes.length - 1][0]}.`;
  }

  function descargar() {
    const ancho = 1080;
    const alto = 1350;
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, 0, ancho, alto);
    grad.addColorStop(0, "#0b0f19");
    grad.addColorStop(1, "#3b2a0a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, ancho, alto);

    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(0, 0, ancho, 14);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "600 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GADU SORTEOS", ancho / 2, 120);

    ctx.fillStyle = "#f59e0b";
    ctx.font = "700 56px system-ui, sans-serif";
    ctx.fillText("¡TENEMOS GANADOR!", ancho / 2, 300);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "800 92px system-ui, sans-serif";
    ctx.fillText(nombreCorto(winnerName), ancho / 2, 450);

    ctx.font = "500 40px system-ui, sans-serif";
    const lineas = envolver(`Ganó «${title}»`, ancho - 160, ctx);
    lineas.forEach((linea, i) => {
      ctx.fillText(linea, ancho / 2, 560 + i * 52);
    });

    ctx.fillStyle = "#f59e0b";
    ctx.font = "700 72px system-ui, sans-serif";
    ctx.fillText(`Número ${winnerNumber}`, ancho / 2, 760);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "400 30px system-ui, sans-serif";
    ctx.fillText("Resultado verificable · hash público", ancho / 2, 1220);

    const enlace = document.createElement("a");
    enlace.download = `ganador-${winnerNumber}.png`;
    enlace.href = canvas.toDataURL("image/png");
    enlace.click();
  }

  function envolver(
    texto: string,
    maxAncho: number,
    ctx: CanvasRenderingContext2D,
  ): string[] {
    const palabras = texto.split(" ");
    const lineas: string[] = [];
    let actual = "";
    for (const palabra of palabras) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (ctx.measureText(prueba).width > maxAncho && actual) {
        lineas.push(actual);
        actual = palabra;
      } else {
        actual = prueba;
      }
    }
    if (actual) lineas.push(actual);
    return lineas;
  }

  return (
    <Button type="button" variant="outline" onClick={descargar}>
      <Download className="mr-1.5 h-4 w-4" />
      Descargar imagen de ganador
    </Button>
  );
}
