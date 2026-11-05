/** Textos compartidos por la baja de cuenta (spec: 02-DOCS/wiki/ftd/baja-de-cuenta.md). */

export type DeletionStatus = "pending" | "approved" | "rejected" | "cancelled";

/** Motivos que devuelve `account_deletion_blockers` traducidos a algo legible. */
export const BLOCKER_MESSAGES: Record<string, string> = {
  sorteos_abiertos:
    "Tenés sorteos sin cerrar. Cerralos o sortealos antes de pedir la baja.",
  pagos_en_vuelo:
    "Tenés un pago en curso. Esperá a que se resuelva para no dejar plata sin dueño.",
  devoluciones_pendientes:
    "Tenés una devolución pendiente de cobro. Resolvela antes de la baja.",
  numeros_en_sorteos_abiertos:
    "Participás en sorteos que siguen abiertos. Esperá a que terminen.",
};

export const STATUS_LABELS: Record<DeletionStatus, string> = {
  pending: "Pendiente de revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

/** Traduce los códigos de la RPC; descarta códigos desconocidos en vez de mostrarlos crudos. */
export function blockerMessages(motivos: readonly string[]): string[] {
  return motivos
    .map((motivo) => BLOCKER_MESSAGES[motivo])
    .filter((mensaje): mensaje is string => Boolean(mensaje));
}
