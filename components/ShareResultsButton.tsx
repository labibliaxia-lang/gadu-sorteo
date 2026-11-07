"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Comparte la página de resultados con la Web Share API o copia el enlace. */
export function ShareResultsButton({
  titulo,
  ganador,
}: {
  titulo: string;
  ganador: string | null;
}) {
  async function compartir() {
    const url = window.location.href;
    const texto = ganador
      ? `¡${ganador} ganó ${titulo} en Gadu Sorteos!`
      : `Mirá los resultados de ${titulo} en Gadu Sorteos.`;

    if (navigator.share) {
      try {
        await navigator.share({ title: texto, text: texto, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  }

  return (
    <Button size="lg" onClick={() => void compartir()}>
      <Share2 className="mr-2 h-5 w-5" />
      Compartir Resultados
    </Button>
  );
}
