"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, MapPin } from "lucide-react";

import { saveDeliveryAddress } from "@/app/perfil/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
 * Dirección de recepción obligatoria para todos los perfiles.
 * Bloquea la navegación hasta completarla; las páginas legales, el perfil y la
 * verificación quedan accesibles. La dirección no se muestra públicamente.
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
  const [phone, setPhone] = useState(initialPhone);
  const [address, setAddress] = useState(initialAddress);
  const [city, setCity] = useState(initialCity);
  const [province, setProvince] = useState(initialProvince);
  const [postalCode, setPostalCode] = useState(initialPostalCode);
  const [country, setCountry] = useState(initialCountry || "AR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = Boolean(
    pathname && ALLOWED_PATHS.some((path) => pathname.startsWith(path)),
  );
  const blocked = !done && !allowed;

  useEffect(() => {
    if (!blocked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [blocked]);

  if (done || allowed) return null;

  const complete =
    phone.replace(/\D/g, "").length >= 6 &&
    address.trim().length >= 3 &&
    city.trim().length >= 2 &&
    province.trim().length >= 2 &&
    postalCode.trim().length >= 3 &&
    country.trim().length >= 2;

  async function save() {
    setBusy(true);
    setError(null);
    const result = await saveDeliveryAddress({
      phone,
      address_line: address,
      city,
      province,
      postal_code: postalCode,
      country,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
    router.refresh();
  }

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

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="gate-phone" className="text-sm font-medium">
              Teléfono
            </label>
            <Input
              id="gate-phone"
              value={phone}
              maxLength={30}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="gate-address" className="text-sm font-medium">
              Dirección y número
            </label>
            <Input
              id="gate-address"
              value={address}
              maxLength={160}
              onChange={(event) => setAddress(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="gate-city" className="text-sm font-medium">
              Ciudad
            </label>
            <Input
              id="gate-city"
              value={city}
              maxLength={80}
              onChange={(event) => setCity(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="gate-province" className="text-sm font-medium">
              Provincia
            </label>
            <Input
              id="gate-province"
              value={province}
              maxLength={80}
              onChange={(event) => setProvince(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="gate-postal" className="text-sm font-medium">
              Código postal
            </label>
            <Input
              id="gate-postal"
              value={postalCode}
              maxLength={12}
              onChange={(event) => setPostalCode(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="gate-country" className="text-sm font-medium">
              País
            </label>
            <Input
              id="gate-country"
              value={country}
              maxLength={80}
              onChange={(event) => setCountry(event.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <Button
          className="mt-4 w-full"
          onClick={() => void save()}
          disabled={!complete || busy}
        >
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Guardar dirección y continuar
        </Button>
      </div>
    </div>
  );
}
