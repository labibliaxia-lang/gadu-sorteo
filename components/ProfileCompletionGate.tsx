"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MapPin } from "lucide-react";

import { DeliveryAddressForm } from "@/components/DeliveryAddressForm";

/** Rutas que quedan accesibles aunque falte la dirección. */
const ALLOWED_PATHS = [
  "/perfil",
  "/login",
  "/register",
  "/auth",
  "/terminos",
  "/privacidad",
  "/admin/verificacion",
];

/**
 * Modal de dirección de entrega, **bloqueante sólo en el panel del organizador**.
 *
 * Antes bloqueaba cualquier ruta: un comprador que entraba a mirar un sorteo se
 * encontraba con un formulario de dirección antes de poder elegir un número.
 * Para un sorteo de $100 eso es pedirle la dirección a alguien que quizá sólo
 * quiere curiosear.
 *
 * Ahora:
 *  - en `/admin/*` sigue siendo bloqueante (el organizador igual la necesita, y
 *    la base rechaza publicar sin ella);
 *  - en el resto del sitio no aparece: la dirección se pide al reservar, desde
 *    `NumbersGrid`, que abre `DeliveryAddressForm` en el momento justo.
 */
export function ProfileCompletionGate({
  missing,
  initialPhone,
  initialAddress,
  initialCity,
  initialProvince,
  initialPostalCode,
  initialCountry,
}: {
  missing: boolean;
  initialPhone: string;
  initialAddress: string;
  initialCity: string;
  initialProvince: string;
  initialPostalCode: string;
  initialCountry: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [done, setDone] = useState(!missing);

  useEffect(() => {
    setDone(!missing);
  }, [missing]);

  const exceptuado = Boolean(
    pathname && ALLOWED_PATHS.some((path) => pathname.startsWith(path)),
  );
  const enPanel = Boolean(pathname?.startsWith("/admin"));
  const blocked = !done && enPanel && !exceptuado;

  useEffect(() => {
    if (!blocked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [blocked]);

  if (!blocked) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-gate-title"
    >
      <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-brand-600" />
          <h2 id="delivery-gate-title" className="text-lg font-semibold">
            Dirección de recepción de premios
          </h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Necesitamos una dirección para enviarte un premio si ganás. Es
          privada: no se muestra en tu perfil público.
        </p>

        <DeliveryAddressForm
          inicial={{
            phone: initialPhone,
            address_line: initialAddress,
            city: initialCity,
            province: initialProvince,
            postal_code: initialPostalCode,
            country: initialCountry,
          }}
          onSaved={() => {
            setDone(true);
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}
