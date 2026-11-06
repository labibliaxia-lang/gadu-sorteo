/**
 * Link de WhatsApp para pedir el comprobante de una reserva.
 *
 * El teléfono puede venir con formato libre (0, 15, guiones, +54). Se limpia a
 * dígitos y, si no trae el código de país, se le antepone 54 (Argentina). Sin
 * teléfono, se abre el selector de WhatsApp con el texto ya escrito.
 */
export function waHref(
  phone: string | null | undefined,
  nombre: string,
  numeros: readonly number[],
): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const destino = digits ? (digits.startsWith("54") ? digits : `54${digits}`) : "";

  const texto = encodeURIComponent(
    `Hola ${nombre}, recibimos tu reserva de ${numeros.length} número(s) en Gadu. Pasános el comprobante para confirmarla.`,
  );

  return destino
    ? `https://wa.me/${destino}?text=${texto}`
    : `https://wa.me/?text=${texto}`;
}
