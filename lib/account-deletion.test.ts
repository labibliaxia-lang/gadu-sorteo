import { describe, expect, it } from "vitest";

import { BLOCKER_MESSAGES, blockerMessages, STATUS_LABELS } from "@/lib/account-deletion";

describe("blockerMessages", () => {
  it("traduce todos los motivos conocidos", () => {
    const mensajes = blockerMessages(Object.keys(BLOCKER_MESSAGES));

    expect(mensajes).toHaveLength(Object.keys(BLOCKER_MESSAGES).length);
    mensajes.forEach((m) => expect(m.length).toBeGreaterThan(10));
  });

  it("descarta códigos desconocidos", () => {
    expect(blockerMessages(["pagos_en_vuelo", "motivo_nuevo"])).toEqual([
      BLOCKER_MESSAGES.pagos_en_vuelo,
    ]);
  });

  it("una lista vacía no produce mensajes", () => {
    expect(blockerMessages([])).toEqual([]);
  });
});

describe("STATUS_LABELS", () => {
  it("cubre los cuatro estados del check de la base", () => {
    expect(Object.keys(STATUS_LABELS).sort()).toEqual([
      "approved",
      "cancelled",
      "pending",
      "rejected",
    ]);
  });
});
