"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { canFeature } from "@/lib/featured";
import { setRaffleFeatured } from "@/app/admin/super/actions";

/**
 * Destaca o quita un sorteo de la cartelera (migración 0066). Solo aparece en
 * el panel de superadmin; la Server Action vuelve a exigir ese rol.
 *
 * Regla: **un solo destacado a la vez** y solo sobre sorteos activos.
 */
export function FeatureRaffleButton({
  raffleId,
  featured,
  status,
}: {
  raffleId: string;
  featured: boolean;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectable = canFeature(status);

  async function toggle() {
    setBusy(true);
    setError(null);

    const result = await setRaffleFeatured(raffleId, !featured);

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant={featured ? "secondary" : "outline"}
        size="sm"
        onClick={toggle}
        disabled={busy || (!featured && !selectable)}
        title={
          !featured && !selectable
            ? "Solo un sorteo activo puede destacarse"
            : undefined
        }
      >
        <Star
          className={featured ? "mr-1.5 h-3.5 w-3.5 fill-current" : "mr-1.5 h-3.5 w-3.5"}
          aria-hidden="true"
        />
        {busy ? "Guardando…" : featured ? "Quitar destacado" : "Destacar"}
      </Button>
      {error && (
        <p className="max-w-[220px] text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
