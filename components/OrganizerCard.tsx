import Image from "next/image";
import { BadgeCheck, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Profile } from "@/lib/types";

/**
 * Tarjeta de identidad del organizador (sin botones de contacto):
 * la información de contacto vive en OrganizerContact, al final de la página.
 */
export function OrganizerCard({ organizer }: { organizer: Profile }) {
  const initial = (organizer.full_name || "O").charAt(0).toUpperCase();

  return (
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
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-xl font-bold text-white">
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
            {organizer.location && (
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {organizer.location}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
