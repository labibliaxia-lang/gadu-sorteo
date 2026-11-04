"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { setRaffleFeatured } from "@/app/admin/super/actions";

/**
 * Destaca o quita un sorteo de la cartelera (migración 0066). Solo aparece en
 * el panel de superadmin; la Server Action vuelve a exigir ese rol.
 */
export function FeatureRaffleButton({
  raffleId,
  featured,
}: {
  raffleId: string;
  featured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        disabled={busy}
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
