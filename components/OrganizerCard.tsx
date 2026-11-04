import Image from "next/image";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PublicOrganizer } from "@/lib/types";

/**
 * Tarjeta de identidad del organizador (sin botones de contacto):
 * la información de contacto vive en OrganizerContact, al final de la página.
 *
 * Recibe la fila de la vista pública `public_organizers`: no tiene email,
 * teléfono, ubicación ni datos del KYC. Si recibe `href`, toda la tarjeta
 * enlaza al perfil público del organizador.
 */
export function OrganizerCard({
  organizer,
  href,
}: {
  organizer: PublicOrganizer;
  href?: string | null;
}) {
  const initial = (organizer.full_name || "O").charAt(0).toUpperCase();

  const card = (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          {organizer.avatar_url ? (
            <Image
              src={organizer.avatar_url}
              alt={organizer.full_name ?? "Organizador"}
              width={56}
              height={56}
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-panel-3 text-xl font-semibold text-brand-accent ring-1 ring-hairline">
              {initial}
            </div>
          )}

          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 font-semibold">
              {organizer.full_name || "Organizador"}
              {organizer.is_verified && (
                <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-500" />
              )}
            </p>
            {organizer.is_verified && (
              <Badge variant="success">✓ Identidad Verificada</Badge>
            )}
            {href && (
              <p className="text-xs text-muted-foreground">
                Ver perfil y sorteos →
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!href) return card;

  return (
    <Link
      href={href}
      className="block rounded-xl transition hover:opacity-90"
      aria-label={`Ver perfil de ${organizer.full_name || "el organizador"}`}
    >
      {card}
    </Link>
  );
}
