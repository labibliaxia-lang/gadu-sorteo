import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Red de seguridad de reservas vencidas.
 *
 * El riesgo de esto no es la corrección del UPDATE (eso lo hace la RPC) sino el
 * costo: la página pública se renderiza mucho y sin freno cada visita sería un
 * UPDATE. El gate de frecuencia es lo que se prueba acá.
 */

const rpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

const { maybeReleaseExpiredReservations, reiniciarGateDeLiberacion } = await import(
  "./release-expired"
);

describe("maybeReleaseExpiredReservations", () => {
  beforeEach(() => {
    rpc.mockReset();
    reiniciarGateDeLiberacion();
    // Los caminos de error loguean a propósito; no ensuciamos la salida del test.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("libera y devuelve cuántas", async () => {
    rpc.mockResolvedValue({ data: 3, error: null });

    await expect(maybeReleaseExpiredReservations({ forzar: true })).resolves.toBe(3);
    expect(rpc).toHaveBeenCalledWith("release_expired_reservations");
  });

  it("no golpea la base dos veces dentro del minuto", async () => {
    rpc.mockResolvedValue({ data: 0, error: null });

    const primero = await maybeReleaseExpiredReservations({ ahora: 1_000_000 });
    const segundo = await maybeReleaseExpiredReservations({ ahora: 1_030_000 });

    expect(primero).toBe(0);
    expect(segundo).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("vuelve a correr pasado el minuto", async () => {
    rpc.mockResolvedValue({ data: 1, error: null });

    await maybeReleaseExpiredReservations({ ahora: 1_000_000 });
    const tercero = await maybeReleaseExpiredReservations({ ahora: 1_061_000 });

    expect(tercero).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("si la RPC falla devuelve null y no rompe el render", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(maybeReleaseExpiredReservations({ forzar: true })).resolves.toBeNull();
  });

  it("si la RPC tira excepción devuelve null", async () => {
    rpc.mockRejectedValue(new Error("sin conexión"));

    await expect(maybeReleaseExpiredReservations({ forzar: true })).resolves.toBeNull();
  });

  it("un resultado que no es número cuenta como cero", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await expect(maybeReleaseExpiredReservations({ forzar: true })).resolves.toBe(0);
  });
});
