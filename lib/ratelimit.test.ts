import { describe, expect, it } from "vitest";

import { getClientIp, retryAfterSeconds } from "@/lib/ratelimit";

describe("getClientIp", () => {
  it("toma la primera IP de x-forwarded-for", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    });
    expect(getClientIp(headers)).toBe("203.0.113.7");
  });

  it("usa x-real-ip si no hay forwarded", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.4" });
    expect(getClientIp(headers)).toBe("198.51.100.4");
  });

  it("devuelve unknown sin headers", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});

describe("retryAfterSeconds", () => {
  it("calcula al menos un segundo", () => {
    expect(
      retryAfterSeconds({
        success: false,
        limit: 5,
        remaining: 0,
        reset: Date.now() + 2500,
      }),
    ).toBeGreaterThanOrEqual(2);
  });

  it("devuelve 60 si no hay reset", () => {
    expect(
      retryAfterSeconds({
        success: false,
        limit: 5,
        remaining: 0,
        reset: 0,
      }),
    ).toBe(60);
  });
});
