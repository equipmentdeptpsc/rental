import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const GROUPED_REVIEW_ENVELOPE_TYPE = "GROUPED_CUSTOMER_REVIEW_PATH";
export interface GroupedReviewDeliveryEnvelope {
  envelopeType: typeof GROUPED_REVIEW_ENVELOPE_TYPE; envelopeVersion: 1; keyVersion: 1;
  ciphertext: string; nonce: string; authTag: string;
}

export function parseGroupedReviewDeliveryKey(environment: NodeJS.ProcessEnv = process.env): Buffer {
  const encoded = environment.GROUPED_REVIEW_DELIVERY_ENCRYPTION_KEY_V1?.trim();
  if (!encoded) throw new Error("Missing server-only grouped review delivery encryption key version 1.");
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error("Grouped review delivery encryption key must be canonical base64.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("Grouped review delivery encryption key must contain exactly 32 bytes.");
  return key;
}

function aad(notificationId: string): Buffer {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(notificationId)) throw new Error("Invalid grouped review notification identity.");
  return Buffer.from(`${GROUPED_REVIEW_ENVELOPE_TYPE}|v1|${notificationId}`, "utf8");
}

export function encryptGroupedReviewDeliveryEnvelope(reviewPath: string, notificationId: string, key: Buffer): GroupedReviewDeliveryEnvelope {
  if (key.length !== 32) throw new Error("Invalid grouped review delivery encryption key.");
  if (!/^\/review\/customer\/grouped\/[0-9a-f]{64}$/.test(reviewPath)) throw new Error("Invalid grouped review path.");
  const nonce = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad(notificationId));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ version: 1, reviewPath }), "utf8"), cipher.final()]);
  return { envelopeType: GROUPED_REVIEW_ENVELOPE_TYPE, envelopeVersion: 1, keyVersion: 1,
    ciphertext: ciphertext.toString("base64"), nonce: nonce.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

export function decryptGroupedReviewDeliveryEnvelope(envelope: GroupedReviewDeliveryEnvelope, notificationId: string, key: Buffer): string {
  if (key.length !== 32 || envelope.envelopeType !== GROUPED_REVIEW_ENVELOPE_TYPE || envelope.envelopeVersion !== 1 || envelope.keyVersion !== 1) throw new Error("Unsupported grouped review delivery envelope.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.nonce, "base64"), { authTagLength: 16 });
    decipher.setAAD(aad(notificationId)); decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
    const value = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8")) as { version?: unknown; reviewPath?: unknown };
    if (value.version !== 1 || typeof value.reviewPath !== "string" || !/^\/review\/customer\/grouped\/[0-9a-f]{64}$/.test(value.reviewPath)) throw new Error();
    return value.reviewPath;
  } catch { throw new Error("Grouped review delivery envelope authentication failed."); }
}
