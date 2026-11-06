/**
 * Semáforo de confianza de un organizador.
 *
 * POR QUÉ NO ES EL PROMEDIO DE ESTRELLAS
 * Cinco estrellas de dos amigos no dicen nada, y con tres reseñas el promedio es
 * ruido. La barra se calcula con señales que no se pueden pedir de favor: KYC
 * aprobado, sorteos efectivamente sorteados, cancelaciones, devoluciones
 * impagas y denuncias abiertas. Las reseñas suman, pero poco y desde un mínimo.
 *
 * TRES ESTADOS, NO UN DEGRADÉ
 * Un degradé continuo invita a leer «amarillo = más o menos», y ahí decide la
 * simpatía. Un organizador con dos sorteos no es «verde»: es «sin historial».
 * Prometer confianza sin evidencia es lo que después explota.
 *
 * REGLA DURA
 * Si hay devoluciones pendientes o denuncias abiertas, el organizador va a
 * «con problemas» aunque tenga veinte reseñas de cinco estrellas. Debe plata:
 * eso manda sobre cualquier promedio.
 *
 * LO QUE ESTE SEMÁFORO NO ES
 * No es una garantía. Dice «se comportó bien hasta ahora», no «te va a devolver
 * la plata». Presentarlo como garantía cuesta la credibilidad de toda la
 * plataforma la primera vez que algo sale mal.
 */

export interface SenalesConfianza {
  /** `verification_status === 'approved'`. */
  kycAprobado: boolean;
  /** Fecha de alta del organizador (ISO), para la antigüedad. */
  cuentaDesde: string | null;
  /** Sorteos que llegaron a `drawn`. La señal más fuerte de todas. */
  sorteosSorteados: number;
  /** Sorteos cancelados. */
  sorteosCancelados: number;
  /** Sorteos publicados que todavía no se sortearon. */
  sorteosActivos: number;
  /** Devoluciones en estado `pending` de sus sorteos. */
  devolucionesPendientes: number;
  /** Denuncias en estado `pending` sobre sus sorteos. */
  denunciasAbiertas: number;
  /** Cantidad de reseñas verificadas recibidas. */
  resenas: number;
  /** Promedio 1..5, o null si no hay reseñas. */
  promedioResenas: number | null;
}

export type NivelConfianza = "sin-historial" | "confiable" | "con-problemas";

export interface Confianza {
  nivel: NivelConfianza;
  /** 0..100. En «sin historial» queda en 0 porque no se puntúa. */
  puntaje: number;
  /** Frases cortas para mostrar debajo de la barra. El color solo no alcanza. */
  motivos: string[];
  /** Texto del aviso, o null si no hace falta advertir nada. */
  advertencia: string | null;
}

/** Mínimo de reseñas para que el promedio empiece a contar. */
export const RESENAS_MINIMAS = 3;

/** Días de antigüedad que suman algo. */
const DIAS_PARA_SUMAR = 90;

const limitar = (valor: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, valor));

export function calcularConfianza(senales: SenalesConfianza, ahora = Date.now()): Confianza {
  const motivos: string[] = [];

  if (senales.kycAprobado) motivos.push("Identidad verificada (DNI y selfie)");
  if (senales.sorteosSorteados > 0) {
    motivos.push(
      `${senales.sorteosSorteados} sorteo${senales.sorteosSorteados === 1 ? "" : "s"} completado${
        senales.sorteosSorteados === 1 ? "" : "s"
      }`,
    );
  }
  if (senales.sorteosCancelados > 0) {
    motivos.push(
      `${senales.sorteosCancelados} cancelado${senales.sorteosCancelados === 1 ? "" : "s"}`,
    );
  }
  if (senales.resenas >= RESENAS_MINIMAS) {
    motivos.push(
      `${senales.resenas} reseñas de compradores${
        senales.promedioResenas ? ` (${senales.promedioResenas.toFixed(1)}/5)` : ""
      }`,
    );
  } else if (senales.resenas > 0) {
    motivos.push(`${senales.resenas} reseña${senales.resenas === 1 ? "" : "s"} todavía sin peso`);
  }
  if (senales.devolucionesPendientes > 0) {
    motivos.push(
      `${senales.devolucionesPendientes} ${
        senales.devolucionesPendientes === 1 ? "devolución" : "devoluciones"
      } sin pagar`,
    );
  }
  if (senales.denunciasAbiertas > 0) {
    motivos.push(
      `${senales.denunciasAbiertas} denuncia${senales.denunciasAbiertas === 1 ? "" : "s"} sin resolver`,
    );
  }
  if (senales.sorteosActivos > 0) {
    motivos.push(
      `${senales.sorteosActivos} sorteo${senales.sorteosActivos === 1 ? "" : "s"} en curso`,
    );
  }

  // ---- Regla dura: deuda o denuncias mandan sobre todo lo demás.
  if (senales.devolucionesPendientes > 0 || senales.denunciasAbiertas > 0) {
    return {
      nivel: "con-problemas",
      puntaje: limitar(
        25 - senales.devolucionesPendientes * 5 - senales.denunciasAbiertas * 5,
        0,
        25,
      ),
      motivos,
      advertencia:
        senales.devolucionesPendientes > 0
          ? "Este organizador tiene devoluciones sin pagar. No le transfieras dinero sin resolverlo antes."
          : "Este organizador tiene denuncias sin resolver. Tomá precauciones antes de transferir.",
    };
  }

  // ---- Sin historial: no se puntúa, no se promete nada.
  if (senales.sorteosSorteados === 0) {
    return {
      nivel: "sin-historial",
      puntaje: 0,
      motivos,
      advertencia:
        "Este organizador todavía no completó ningún sorteo. Si no lo conocés, tomá precauciones antes de transferir.",
    };
  }

  // ---- Con historial limpio: se puntúa.
  let puntaje = 50;
  puntaje += senales.kycAprobado ? 20 : 0;
  puntaje += limitar(senales.sorteosSorteados * 4, 0, 15);
  puntaje -= limitar(senales.sorteosCancelados * 8, 0, 25);

  if (senales.resenas >= RESENAS_MINIMAS && senales.promedioResenas !== null) {
    // Un promedio de 5/5 suma hasta 10; uno de 1/5 resta hasta 10.
    puntaje += limitar((senales.promedioResenas - 3) * 5, -10, 10);
  }

  if (senales.cuentaDesde) {
    const dias = (ahora - new Date(senales.cuentaDesde).getTime()) / 86_400_000;
    if (dias >= DIAS_PARA_SUMAR) puntaje += 5;
  }

  puntaje = limitar(Math.round(puntaje), 0, 100);

  return {
    nivel: "confiable",
    puntaje,
    motivos,
    advertencia: null,
  };
}

/** Texto corto del nivel, para la etiqueta de la barra. */
export const ETIQUETA_NIVEL: Record<NivelConfianza, string> = {
  "sin-historial": "Sin historial",
  confiable: "Con historial",
  "con-problemas": "Con problemas",
};
