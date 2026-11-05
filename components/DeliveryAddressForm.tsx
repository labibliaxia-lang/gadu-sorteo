"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { saveDeliveryAddress } from "@/app/perfil/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { direccionEntregaCompleta } from "@/lib/direccion";

/**
 * Formulario de dirección de entrega, compartido.
 *
 * Lo usan dos lugares con intenciones distintas:
 *  - `ProfileCompletionGate`: modal bloqueante, sólo en los flujos donde la
 *    dirección es imprescindible (panel del organizador).
 *  - `NumbersGrid`: diálogo que aparece al reservar, para no frenar la compra
 *    antes de que la persona haya elegido sus números.
 *
 * Los `id` de los campos se mantienen estables (`gate-*`) porque la simulación
 * y los tests de UI los usan.
 */

export interface DireccionInicial {
  phone?: string | null;
  address_line?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

export function DeliveryAddressForm({
  inicial,
  onSaved,
  submitLabel = "Guardar dirección y continuar",
}: {
  inicial?: DireccionInicial;
  onSaved: () => void;
  submitLabel?: string;
}) {
  const [phone, setPhone] = useState(inicial?.phone ?? "");
  const [address, setAddress] = useState(inicial?.address_line ?? "");
  const [city, setCity] = useState(inicial?.city ?? "");
  const [province, setProvince] = useState(inicial?.province ?? "");
  const [postalCode, setPostalCode] = useState(inicial?.postal_code ?? "");
  const [country, setCountry] = useState(inicial?.country || "AR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completo = direccionEntregaCompleta({
    phone,
    address_line: address,
    city,
    province,
    postal_code: postalCode,
    country,
  });

  async function guardar() {
    setBusy(true);
    setError(null);

    const resultado = await saveDeliveryAddress({
      phone,
      address_line: address,
      city,
      province,
      postal_code: postalCode,
      country,
    });

    setBusy(false);

    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }

    onSaved();
  }

  return (
    <div>
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
        onClick={() => void guardar()}
        disabled={!completo || busy}
      >
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
        {submitLabel}
      </Button>
    </div>
  );
}
