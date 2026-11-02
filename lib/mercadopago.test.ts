import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyWebhookSignature } from "./mercadopago";

const SECRET = "test-secret";
const TS = "1704908010";
const REQUEST_ID = "abc-123-def";
const DATA_ID = "999999999";

function sign(manifest: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(manifest).digest("hex");
}

/** Header como el que manda Mercado Pago. */
function headerFor(manifest: string, ts = TS): string {
  return `ts=${ts},v1=${sign(manifest)}`;
}

/** Manifest oficial: id:[data.id];request-id:[x-request-id];ts:[ts]; */
function officialManifest(dataId: string, requestId = REQUEST_ID, ts = TS): string {
  return `id:${dataId};request-id:${requestId};ts:${ts};`;
}

describe("verifyWebhookSignature", () => {
  beforeEach(() => {
    process.env.MP_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.MP_WEBHOOK_SECRET;
  });

  it("acepta una notificación firmada con el manifest oficial de MP", () => {
    const result = verifyWebhookSignature({
      xSignature: headerFor(officialManifest(DATA_ID)),
      xRequestId: REQUEST_ID,
      dataId: DATA_ID,
    });

    expect(result).toEqual({ ok: true });
  });

  it("rechaza la firma con el esquema viejo `${ts}.${body}`", () => {
    const body = JSON.stringify({ id: 12345, type: "payment", data: { id: DATA_ID } });
    const result = verifyWebhookSignature({
      xSignature: headerFor(`${TS}.${body}`),
      xRequestId: REQUEST_ID,
      dataId: DATA_ID,
    });

    expect(result).toEqual({ ok: false, reason: "SignatureMismatch" });
  });

  it("rechaza una firma calculada con otro secreto", () => {
    const result = verifyWebhookSignature({
      xSignature: `ts=${TS},v1=${sign(officialManifest(DATA_ID), "otro-secreto")}`,
      xRequestId: REQUEST_ID,
      dataId: DATA_ID,
    });

    expect(result).toEqual({ ok: false, reason: "SignatureMismatch" });
  });

  it("rechaza la notificación sin header de firma", () => {
    const result = verifyWebhookSignature({
      xSignature: null,
      xRequestId: REQUEST_ID,
      dataId: DATA_ID,
    });

    expect(result).toEqual({ ok: false, reason: "MissingSignatureHeader" });
  });

  it("aplica la regla de MP: data.id alfanumérico se firma en minúsculas", () => {
    const upper = "ORD01JQ4S4KY8HWQ6NA5PXB65B3D3";
    const result = verifyWebhookSignature({
      xSignature: headerFor(officialManifest(upper.toLowerCase())),
      xRequestId: REQUEST_ID,
      dataId: upper,
    });

    expect(result).toEqual({ ok: true });
  });

  it("falla cerrado cuando no hay secreto configurado", () => {
    delete process.env.MP_WEBHOOK_SECRET;

    const result = verifyWebhookSignature({
      xSignature: headerFor(officialManifest(DATA_ID)),
      xRequestId: REQUEST_ID,
      dataId: DATA_ID,
    });

    expect(result).toEqual({ ok: false, reason: "MissingSecret" });
  });
});
