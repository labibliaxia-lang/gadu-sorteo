/**
 * Planilla de ventas por comprador.
 *
 * POR QUÉ EXISTE
 * El panel mostraba los números vendidos como grilla y las reservas esperando
 * pago por comprador, pero no había una vista de VENTAS: quién compró qué, con
 * su contacto y el total. Para pasar lista contra las transferencias había que
 * cruzar la grilla a mano.
 *
 * QUÉ NO INCLUYE, A PROPÓSITO
 * Email, DNI y domicilio. La vista `raffle_buyers` (0073) expone sólo nombre y
 * teléfono porque es lo único que hace falta para validar una transferencia.
 * El alcance de esta planilla es el mismo.
 */

export interface NumeroVendido {
  number: number;
  sold_to: string | null;
  sold_at: string | null;
}

export interface Comprador {
  buyer_id: string;
  full_name: string | null;
  phone: string | null;
}

export interface FilaVenta {
  compradorId: string | null;
  nombre: string;
  telefono: string | null;
  numeros: number[];
  cantidad: number;
  total: number;
  primeraVenta: string | null;
  ultimaVenta: string | null;
}

export interface ResumenVentas {
  compradores: number;
  numeros: number;
  total: number;
  /** Cuántos números se vendieron sin dueño registrado. */
  anonimos: number;
}

/** Etiqueta para los números vendidos sin `sold_to`. */
export const SIN_COMPRADOR = "Sin comprador registrado";

/**
 * Agrupa los números vendidos por comprador y calcula totales.
 *
 * @param vendidos   filas de `raffle_numbers` con status 'sold'
 * @param compradores contacto por `buyer_id` (vista `raffle_buyers`)
 * @param precio     precio por número del sorteo
 */
export function agruparVentas(
  vendidos: NumeroVendido[],
  compradores: Comprador[],
  precio: number,
): FilaVenta[] {
  const contacto = new Map(compradores.map((c) => [c.buyer_id, c]));
  const grupos = new Map<string | null, FilaVenta>();

  for (const vendido of vendidos) {
    const clave = vendido.sold_to ?? null;
    let fila = grupos.get(clave);

    if (!fila) {
      const datos = clave ? contacto.get(clave) : undefined;
      fila = {
        compradorId: clave,
        nombre: datos?.full_name?.trim() || (clave ? `Comprador ${clave.slice(0, 8)}` : SIN_COMPRADOR),
        telefono: datos?.phone?.trim() || null,
        numeros: [],
        cantidad: 0,
        total: 0,
        primeraVenta: null,
        ultimaVenta: null,
      };
      grupos.set(clave, fila);
    }

    fila.numeros.push(vendido.number);

    if (vendido.sold_at) {
      if (!fila.primeraVenta || vendido.sold_at < fila.primeraVenta) fila.primeraVenta = vendido.sold_at;
      if (!fila.ultimaVenta || vendido.sold_at > fila.ultimaVenta) fila.ultimaVenta = vendido.sold_at;
    }
  }

  const filas = [...grupos.values()].map((fila) => ({
    ...fila,
    numeros: [...fila.numeros].sort((a, b) => a - b),
    cantidad: fila.numeros.length,
    total: fila.numeros.length * precio,
  }));

  // Los que más compraron primero; a igual cantidad, el más reciente.
  return filas.sort((a, b) => {
    if (b.cantidad !== a.cantidad) return b.cantidad - a.cantidad;
    return (b.ultimaVenta ?? "").localeCompare(a.ultimaVenta ?? "");
  });
}

export function resumirVentas(filas: FilaVenta[]): ResumenVentas {
  return {
    compradores: filas.filter((f) => f.compradorId !== null).length,
    numeros: filas.reduce((total, f) => total + f.cantidad, 0),
    total: filas.reduce((total, f) => total + f.total, 0),
    anonimos: filas.filter((f) => f.compradorId === null).reduce((total, f) => total + f.cantidad, 0),
  };
}

/** Escapa un campo para CSV: comillas dobles y separadores. */
function campo(valor: string | number | null): string {
  const texto = valor === null ? "" : String(valor);
  return /[",\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * CSV listo para Excel: BOM al principio para que los acentos no se rompan,
 * separador `;` (lo que espera Excel en español) y números separados por espacio
 * para que no se partan en columnas.
 */
export function csvDeVentas(filas: FilaVenta[], titulo: string): string {
  const encabezado = ["Comprador", "Teléfono", "Cantidad", "Números", "Total", "Primera venta", "Última venta"];
  const lineas = [
    `Sorteo;${campo(titulo)}`,
    "",
    encabezado.join(";"),
    ...filas.map((f) =>
      [
        campo(f.nombre),
        campo(f.telefono),
        campo(f.cantidad),
        campo(f.numeros.join(" ")),
        campo(f.total),
        campo(f.primeraVenta),
        campo(f.ultimaVenta),
      ].join(";"),
    ),
  ];

  return "\uFEFF" + lineas.join("\r\n") + "\r\n";
}
