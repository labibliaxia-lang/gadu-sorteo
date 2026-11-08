"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
  const t = useTranslations("ShareButton");
  const locale = useLocale();
  const [copied, setCopied] = useState(false);

  /**
   * URL que se comparte. En la página pública del sorteo se usa la URL real
   * (conserva `?ref=` y cualquier parámetro de campaña); fuera de ella, la
   * ruta canónica de la landing. Nunca un enlace genérico al inicio.
   */
  function buildShareUrl(): string {
    if (typeof window === "undefined") return "";
    const { origin, pathname, href } = window.location;
    const publicPath = `/sorteos/${sorteoId}`;
    const localizedPath =
      locale === "es" ? publicPath : `/${locale}${publicPath}`;
    if (
      pathname === publicPath ||
      pathname === localizedPath ||
      pathname.startsWith(`${localizedPath}/`)
    ) {
      return href;
    }
    return `${origin}${localizedPath}`;
  }

  async function handleShare() {
    const url = buildShareUrl();
    const text = t("text", { title: titulo });

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
        aria-label={t("aria", { title: titulo })}
        title={copied ? t("copied") : t("share")}
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
      aria-label={t("aria", { title: titulo })}
      className={className}
    >
      {copied ? (
        <>
          <Check className="mr-1.5 h-4 w-4 text-emerald-500" />
          {t("copied")}
        </>
      ) : (
        <>
          <Share2 className="mr-1.5 h-4 w-4" />
          {t("share")}
        </>
      )}
    </Button>
  );
}
