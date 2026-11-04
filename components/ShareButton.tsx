"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Botón de compartir reutilizable.
 * 1) Intenta la Web Share API nativa (móvil).
 * 2) Si no está disponible o el usuario cancela, copia el enlace al
 *    portapapeles y muestra "¡Copiado!" durante 2 segundos.
 */
export function ShareButton({
  sorteoId,
  titulo,
  className,
  compact = false,
}: {
  sorteoId: string;
  titulo: string;
  className?: string;
  /** Solo ícono: para talones de tarjeta donde la acción primaria manda. */
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = `${window.location.origin}/sorteos/${sorteoId}`;
    const text = `¡Participá en "${titulo}" en Gadu Sorteos!`;

    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, text, url });
        return;
      } catch {
        // Canceló o no se pudo compartir: caer al portapapeles.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin portapapeles disponible: no hacer nada.
    }
  }

  if (compact) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleShare}
        aria-label={`Compartir ${titulo}`}
        title={copied ? "Enlace copiado" : "Compartir"}
        className={className}
      >
        {copied ? (
          <Check className="h-4 w-4 text-emerald-400" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleShare}
      aria-label={`Compartir ${titulo}`}
      className={className}
    >
      {copied ? (
        <>
          <Check className="mr-1.5 h-4 w-4 text-emerald-500" />
          ¡Copiado!
        </>
      ) : (
        <>
          <Share2 className="mr-1.5 h-4 w-4" />
          Compartir
        </>
      )}
    </Button>
  );
}
