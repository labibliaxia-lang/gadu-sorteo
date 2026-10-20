import Image from "next/image";
import { BadgeCheck, Instagram, MapPin, MessageCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

function waLink(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const withCountry = digits.startsWith("54") ? digits : `54${digits}`;
  return `https://wa.me/${withCountry}`;
}

function igLink(instagram: string | null): string | null {
  if (!instagram) return null;
  if (instagram.startsWith("http")) return instagram;
  return `https://instagram.com/${instagram.replace(/^@/, "")}`;
}

export function OrganizerCard({ organizer }: { organizer: Profile }) {
  const whatsapp = waLink(organizer.phone);
  const instagram = igLink(organizer.instagram_url);
  const initial = (organizer.full_name || "O").charAt(0).toUpperCase();

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
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

        <div className="flex flex-wrap gap-2">
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ size: "sm" }),
                "bg-emerald-600 hover:bg-emerald-700",
              )}
            >
              <MessageCircle className="mr-1.5 h-4 w-4" />
              WhatsApp
            </a>
          )}
          {instagram && (
            <a
              href={instagram}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Instagram className="mr-1.5 h-4 w-4" />
              Instagram
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
