/**
 * Links de WhatsApp y normalización de teléfonos argentinos.
 *
 * El perfil guarda el teléfono como texto libre: "+54 9 354 746 9000",
 * "0354 15 469000", "3547469000". Para WhatsApp hace falta el formato
 * internacional móvil (`549` + área + número). La regla simple de anteponer
 * `54` rompía dos casos típicos: el `0` de larga distancia y el `15` que se
 * intercala después del código de área.
 *
 * No hay forma de distinguir una línea fija de un móvil mirando solo los
 * dígitos, así que se asume móvil (WhatsApp no existe en fijas).
 */

/** Deja el teléfono en dígitos internacionales para wa.me, o null si no sirve. */
export function normalizarTelefonoAR(
  phone: string | null | undefined,
): string | null {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;

  // Prefijo internacional escrito como 00.
  if (digits.startsWith("00")) digits = digits.slice(2);

  // Código de país.
  if (digits.startsWith("54")) {
    digits = digits.slice(2);
    // El 9 marca móvil: se reincorpora al final del proceso.
    if (digits.startsWith("9")) digits = digits.slice(1);
  }

  // Cero de larga distancia.
  if (digits.startsWith("0")) digits = digits.slice(1);

  // "15" intercalado después del área: 354 15 469000 → 354 469000.
  const conQuince = digits.match(/^(\d{2,4})15(\d{6,8})$/);
  if (conQuince) digits = `${conQuince[1]}${conQuince[2]}`;

  // Área (2 a 4) + abonado (6 a 8) = 10 dígitos es el formato nacional.
  if (!/^\d{10}$/.test(digits)) return null;

  return `549${digits}`;
}

/** Link de WhatsApp con un texto libre. Sin teléfono válido, abre el selector. */
export function waLink(
  phone: string | null | undefined,
  texto: string,
): string {
  const destino = normalizarTelefonoAR(phone);
  const cuerpo = encodeURIComponent(texto);

  return destino
    ? `https://wa.me/${destino}?text=${cuerpo}`
    : `https://wa.me/?text=${cuerpo}`;
}

/** Link para pedir el comprobante de una reserva. */
export function waHref(
  phone: string | null | undefined,
  nombre: string,
  numeros: readonly number[],
): string {
  return waLink(
    phone,
    `Hola ${nombre}, recibimos tu reserva de ${numeros.length} número(s) en Gadu. Pasános el comprobante para confirmarla.`,
  );
}

/** Teléfono legible para mostrar en pantalla: +54 9 354 746 9000. */
export function telefonoLegible(
  phone: string | null | undefined,
): string | null {
  const destino = normalizarTelefonoAR(phone);
  if (!destino) return null;

  // 549 + área (3 típico) + resto.
  const area = destino.slice(3, 6);
  const abonado = destino.slice(6);
  return `+54 9 ${area} ${abonado.slice(0, 3)}-${abonado.slice(3)}`;
}
