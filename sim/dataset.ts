/**
 * Datos ficticios reutilizables para la simulación de ciclo completo.
 *
 * Nada de esto es real: nombres inventados, teléfonos 5555 y correos @gadu.test.
 * El sorteo y la semilla son fijos para que los hashes sean reproducibles entre
 * corridas y entre el test y una persona que verifique a mano.
 */

export interface PersonaSimulada {
  id: string;
  nombre: string;
  rol: "comprador" | "organizador" | "verificador";
  telefono: string;
  email: string;
  objetivo: string;
  numeros: number[];
}

export const PERSONAS: PersonaSimulada[] = [
  {
    id: "ana-compradora",
    nombre: "Ana Ficticia Pérez",
    rol: "comprador",
    telefono: "+5491155550101",
    email: "ana.ficticia@gadu.test",
    objetivo: "Reservar 2 números y mandar el comprobante por WhatsApp",
    numeros: [3, 17],
  },
  {
    id: "bruno-ballotage",
    nombre: "Bruno Ficticio Gómez",
    rol: "comprador",
    telefono: "+5491155550102",
    email: "bruno.ficticio@gadu.test",
    objetivo: "Reservar varios números y comprobar que la reserva no se libera",
    numeros: [101, 102, 103, 104, 105, 106, 107, 108],
  },
  {
    id: "carla-organizadora",
    nombre: "Carla Ficticia Ríos",
    rol: "organizador",
    telefono: "+5491155550103",
    email: "carla.ficticia@gadu.test",
    objetivo: "Crear el sorteo, confirmar el pago y sortear",
    numeros: [],
  },
  {
    id: "diego-verificador",
    nombre: "Diego Ficticio Sosa",
    rol: "verificador",
    telefono: "+5491155550104",
    email: "diego.ficticio@gadu.test",
    objetivo: "Recalcular el hash con la semilla pública",
    numeros: [],
  },
];

/** Id fijo del sorteo de laboratorio, para que los hashes sean reproducibles. */
export const SORTEO_DEMO = "11111111-1111-4111-8111-111111111111";

/** Semilla comprometida fija: 64 caracteres hex, igual que dos UUID v4 sin guiones. */
export const SEMILLA_FIJA = "0123456789abcdef".repeat(4);

export interface ManipulacionSimulada {
  indice: number;
  valor: number;
}

export interface EscenarioSimulado {
  id: string;
  descripcion: string;
  numeros: number[];
  premios: number;
  manipulacion?: ManipulacionSimulada;
}

const rango = (desde: number, hasta: number): number[] =>
  Array.from({ length: hasta - desde + 1 }, (_, posicion) => desde + posicion);

export const ESCENARIO_CHICO: EscenarioSimulado = {
  id: "chico-10",
  descripcion: "Sorteo chico de 10 números, un premio",
  numeros: rango(1, 10),
  premios: 1,
};

export const ESCENARIO_GRANDE: EscenarioSimulado = {
  id: "grande-10000",
  descripcion: "Sorteo de 10.000 números, un premio",
  numeros: rango(1, 10000),
  premios: 1,
};

export const ESCENARIO_UNICO: EscenarioSimulado = {
  id: "un-participante",
  descripcion: "Un solo participante con un solo número",
  numeros: [7],
  premios: 1,
};

export const ESCENARIO_MULTI: EscenarioSimulado = {
  id: "multipremio-50",
  descripcion: "100 números vendidos y 50 premios sin repetir",
  numeros: rango(1, 100),
  premios: 50,
};

export const ESCENARIO_MANIPULADO: EscenarioSimulado = {
  id: "manipulado",
  descripcion: "Listado oficial con un número cambiado a mano",
  numeros: rango(1, 10),
  premios: 1,
  manipulacion: { indice: 3, valor: 99 },
};

export const ESCENARIOS: EscenarioSimulado[] = [
  ESCENARIO_CHICO,
  ESCENARIO_GRANDE,
  ESCENARIO_UNICO,
  ESCENARIO_MULTI,
  ESCENARIO_MANIPULADO,
];
