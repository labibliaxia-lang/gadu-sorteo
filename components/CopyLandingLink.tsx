"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Enlace público de la landing del sorteo, listo para copiar.
 *
 * La página existe desde que se crea el sorteo: no hay paso de publicación.
 * Este bloque la muestra y copia en el panel del organizador para que pueda
 * difundirla en el momento que quiera. La URL completa se arma en el cliente
 * (`window.location.origin`) para no depender de variables de entorno.
 */
export function CopyLandingLink({
  raffleId,
  showOpen = true,
  className,
}: {
  raffleId: string;
  showOpen?: boolean;
  className?: string;
}) {
  const path = `/sorteos/${raffleId}`;
  const [url, setUrl] = useState(path);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}${path}`);
  }, [path]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin portapapeles: el enlace queda visible para copiarlo a mano.
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <code className="max-w-full truncate rounded-md border bg-muted/40 px-2 py-1 font-mono text-[12px] text-muted-foreground">
        {url}
      </code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={copy}
        aria-label="Copiar enlace de la landing"
      >
        {copied ? (
          <Check className="mr-1.5 h-4 w-4 text-emerald-500" />
        ) : (
          <Copy className="mr-1.5 h-4 w-4" />
        )}
        {copied ? "¡Copiado!" : "Copiar enlace"}
      </Button>
      {showOpen && (
        <Link
          href={path}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ExternalLink className="mr-1.5 h-4 w-4" />
          Ver landing
        </Link>
      )}
    </div>
  );
}
