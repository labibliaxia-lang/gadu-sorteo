/**
 * Qué datos personales exige el KYC para poder publicar un sorteo.
 *
 * Esta regla vive en la base (`enforce_organizer_kyc`, migración `0060:57-67`) y
 * tiene que ser la MISMA que se usa en el cliente. Cuando no lo fue, el
 * organizador completó los tres pasos del wizard y recién al apretar «Crear
 * sorteo» recibió «KYC incompleto»: el wizard comprobaba 4 campos y el trigger
 * exigía 9.
 *
 * Si cambia la lista del trigger, cambia acá, y el test lo delata.
 */

export interface DatosPersonalesKyc {
  full_name: string | null;
  phone: string | null;
  location: string | null;
  dni_number: string | null;
  dni_address: string | null;
  address_line: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
}

/** Orden pensado para mostrarse en el mensaje que ve la persona. */
export const CAMPOS_KYC: ReadonlyArray<{ campo: keyof DatosPersonalesKyc; etiqueta: string }> = [
  { campo: "full_name", etiqueta: "nombre completo" },
  { campo: "phone", etiqueta: "teléfono" },
  { campo: "location", etiqueta: "ubicación" },
  { campo: "dni_number", etiqueta: "número de DNI" },
  { campo: "dni_address", etiqueta: "dirección del DNI" },
  { campo: "address_line", etiqueta: "dirección de entrega" },
  { campo: "city", etiqueta: "ciudad" },
  { campo: "province", etiqueta: "provincia" },
  { campo: "postal_code", etiqueta: "código postal" },
];

const tiene = (valor: string | null | undefined): boolean =>
  typeof valor === "string" && valor.trim().length > 0;

/** Lista de lo que falta, con etiquetas legibles. Vacía = completo. */
export function datosPersonalesFaltantes(
  perfil: Partial<DatosPersonalesKyc> | null | undefined,
): string[] {
  if (!perfil) return CAMPOS_KYC.map((c) => c.etiqueta);
  return CAMPOS_KYC.filter(({ campo }) => !tiene(perfil[campo])).map(({ etiqueta }) => etiqueta);
}

/** Atajo booleano para gates de UI. */
export function datosPersonalesCompletos(
  perfil: Partial<DatosPersonalesKyc> | null | undefined,
): boolean {
  return datosPersonalesFaltantes(perfil).length === 0;
}
