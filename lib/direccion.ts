/**
 * Regla de «dirección de entrega completa».
 *
 * Espeja `deliverySchema` en `app/perfil/actions.ts` (que es la verdad del
 * servidor: `saveDeliveryAddress` valida con eso). Tenerla también en el cliente
 * sirve para dos cosas: decidir si hay que pedir la dirección y habilitar el
 * botón de guardar con el mismo criterio que después se va a exigir.
 *
 * Ojo: NO es lo mismo que el KYC del organizador (`lib/kyc.ts`). Acá sólo se
 * pide lo necesario para mandar un premio; publicar un sorteo exige además
 * DNI, ubicación y dirección del DNI.
 */

export interface DireccionEntrega {
  phone: string | null;
  address_line: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
}

/** Sin dígitos no hay teléfono: mismo criterio que el esquema del servidor. */
const soloDigitos = (valor: string | null | undefined): string =>
  (valor ?? "").replace(/\D/g, "");

const texto = (valor: string | null | undefined): string => (valor ?? "").trim();

export function direccionEntregaCompleta(
  direccion: Partial<DireccionEntrega> | null | undefined,
): boolean {
  if (!direccion) return false;
  return (
    soloDigitos(direccion.phone).length >= 6 &&
    texto(direccion.address_line).length >= 3 &&
    texto(direccion.city).length >= 2 &&
    texto(direccion.province).length >= 2 &&
    texto(direccion.postal_code).length >= 3 &&
    texto(direccion.country).length >= 2
  );
}
