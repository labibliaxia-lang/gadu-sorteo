"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Copia un texto al portapapeles y avisa con un toast. */
export function CopyTextButton({
  texto,
  label = "Copiar",
  className,
}: {
  texto: string;
  label?: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      toast.success("Enlace copiado");
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void copiar()}
      className={className}
    >
      {copiado ? (
        <Check className="mr-1.5 h-4 w-4 text-emerald-500" />
      ) : (
        <Copy className="mr-1.5 h-4 w-4" />
      )}
      {copiado ? "Copiado" : label}
    </Button>
  );
}
