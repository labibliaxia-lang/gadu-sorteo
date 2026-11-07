/**
 * Bases legales del sorteo: texto plano generado a partir del KYC del
 * organizador.
 *
 * Se renderiza como texto (React escapa por defecto), nunca como HTML. Los
 * valores del perfil se limpian de caracteres de control y se recortan para
 * que un nombre raro no rompa el documento.
 */
export interface RaffleTermsInput {
  organizerName: string | null | undefined;
  organizerDoc: string | null | undefined;
  raffleTitle: string;
  prizeDescription?: string | null;
  drawDateLabel: string;
  priceLabel: string;
  numbersCount: number | null;
  transferAlias?: string | null;
  transferCbu?: string | null;
  transferBank?: string | null;
  whatsapp?: string | null;
}

function limpio(valor: string | null | undefined, max = 120): string {
  return String(valor ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

/** Texto de bases legales listo para mostrar y guardar. */
export function generarBasesLegales(input: RaffleTermsInput): string {
  const organizador = limpio(input.organizerName) || "El organizador";
  const documento = limpio(input.organizerDoc, 30) || "no informado";
  const titulo = limpio(input.raffleTitle, 140) || "el sorteo";
  const premio = limpio(input.prizeDescription, 200);
  const contacto = limpio(input.whatsapp, 40);

  const datosPago = [
    input.transferAlias ? `Alias: ${limpio(input.transferAlias, 120)}` : null,
    input.transferCbu ? `CBU: ${limpio(input.transferCbu, 40)}` : null,
    input.transferBank ? `Banco: ${limpio(input.transferBank, 120)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return [
    `BASES LEGALES DEL SORTEO «${titulo}»`,
    "",
    `Organizador responsable: ${organizador} — DNI/CUIT: ${documento}.`,
    premio ? `Premio: ${premio}.` : null,
    `Fecha del sorteo: ${input.drawDateLabel}.`,
    `Valor del número: ${input.priceLabel}.`,
    input.numbersCount
      ? `Cantidad de números disponibles: ${input.numbersCount}.`
      : null,
    "",
    "1. La participación implica la aceptación plena de estas bases.",
    "2. El número ganador se define con el mecanismo de sorteo verificable publicado en la plataforma (compromiso de semilla previo y hash público del resultado).",
    "3. El resultado se publica en la página del sorteo y es verificable por cualquier persona.",
    "4. El premio se entrega al titular del número ganador, coordinando la entrega con el organizador por los canales informados.",
    "5. Si el sorteo se cancela por decisión del organizador, se devuelve el 100% del dinero por el mismo medio de pago utilizado.",
    "6. No se realizan devoluciones una vez confirmado el pago y realizado el sorteo, salvo lo exigido por la ley aplicable.",
    "7. Los datos personales se tratan según la Política de Privacidad de Gadu Sorteos y solo se usan para gestionar la participación y la entrega del premio.",
    "8. El organizador declara que los datos de identidad informados son verdaderos y coinciden con los verificados en su proceso de KYC.",
    datosPago ? `Medio de pago informado: ${datosPago}.` : null,
    contacto ? `Canal de contacto del organizador: WhatsApp ${contacto}.` : null,
    "",
    "Estas bases fueron generadas automáticamente por Gadu Sorteos el día del alta y publicadas por el organizador.",
  ]
    .filter((linea) => linea !== null)
    .join("\n");
}
