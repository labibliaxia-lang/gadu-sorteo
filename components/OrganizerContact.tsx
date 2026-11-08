import { useTranslations } from "next-intl";
import { Instagram, MessageCircle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Datos de contacto públicos. Salen del sorteo y no del perfil (sin PII). */
export interface OrganizerContactInfo {
  phone: string | null;
  instagram_url: string | null;
}

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

/**
 * Sección secundaria de contacto con el organizador.
 * Se ubica al final de la página para no quitar protagonismo al grid de números.
 */
export function OrganizerContact({
  organizer,
}: {
  organizer: OrganizerContactInfo;
}) {
  const t = useTranslations("OrganizerContact");
  const whatsapp = waLink(organizer.phone);
  const instagram = igLink(organizer.instagram_url);

  if (!whatsapp && !instagram) return null;

  return (
    <section className="space-y-3">
      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("description")}
          </p>
          <div className="flex flex-wrap gap-2">
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm" })}
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
    </section>
  );
}
