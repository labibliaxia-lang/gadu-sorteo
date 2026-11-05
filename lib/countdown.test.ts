import { describe, expect, it } from "vitest";

import { countdownState, formatRemaining } from "@/lib/countdown";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("formatRemaining", () => {
  it("muestra días cuando quedan más de 24 horas", () => {
    expect(formatRemaining(2 * DAY + 4 * HOUR + 12 * 60 * 1000 + 5000)).toBe(
      "2d 04:12:05",
    );
  });

  it("omite los días cuando falta menos de un día", () => {
    expect(formatRemaining(4 * HOUR + 12 * 60 * 1000 + 5000)).toBe("04:12:05");
  });

  it("nunca baja de cero", () => {
    expect(formatRemaining(-5000)).toBe("00:00:00");
    expect(formatRemaining(0)).toBe("00:00:00");
  });

  it("trunca los milisegundos en vez de redondear hacia arriba", () => {
    expect(formatRemaining(1999)).toBe("00:00:01");
  });
});

describe("countdownState", () => {
  const now = Date.parse("2026-11-05T12:00:00.000Z");
  const drawDate = "2026-11-07T16:12:05.000Z";

  it("corre cuando el sorteo está activo y la fecha es futura", () => {
    const state = countdownState(now, drawDate, "active");
    expect(state.kind).toBe("running");
    expect(state.label).toBe("2d 04:12:05");
    expect(state.remainingMs).toBe(
      Date.parse(drawDate) - now,
    );
  });

  it("marca la fecha alcanzada si el sorteo sigue activo pero la hora pasó", () => {
    const state = countdownState(Date.parse(drawDate) + 1000, drawDate, "active");
    expect(state.kind).toBe("reached");
    expect(state.label).toBe("");
    expect(state.remainingMs).toBe(0);
  });

  it("marca alcanzada exactamente en la fecha, sin mostrar negativos", () => {
    const state = countdownState(Date.parse(drawDate), drawDate, "active");
    expect(state.kind).toBe("reached");
  });

  it("no dibuja nada si el sorteo ya no está a la venta", () => {
    for (const status of ["closed", "drawn", "cancelled"] as const) {
      const state = countdownState(now, drawDate, status);
      expect(state.kind).toBe("inactive");
      expect(state.label).toBe("");
    }
  });

  it("no dibuja nada si la fecha no es válida", () => {
    const state = countdownState(now, "no-es-fecha", "active");
    expect(state.kind).toBe("inactive");
  });
});
