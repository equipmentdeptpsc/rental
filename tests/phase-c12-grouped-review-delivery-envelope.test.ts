import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateGroupedReviewCredential, hashGroupedReviewCredential } from "../server/notifications/GroupedReviewCredential";
import { decryptGroupedReviewDeliveryEnvelope, encryptGroupedReviewDeliveryEnvelope, parseGroupedReviewDeliveryKey } from "../server/notifications/GroupedReviewDeliveryEnvelope";

describe("C12 grouped review server credential and AES-GCM envelope", () => {
  const key = randomBytes(32); const id = randomUUID();
  it("generates 256-bit URL-safe credentials with a stable SHA-256 contract", () => {
    const value = generateGroupedReviewCredential();
    expect(value.raw).toMatch(/^[0-9a-f]{64}$/); expect(value.hash).toBe(hashGroupedReviewCredential(value.raw));
    expect(value.reviewPath).toBe(`/review/customer/grouped/${value.raw}`);
  });
  it("requires one explicit canonical 32-byte base64 key", () => {
    expect(parseGroupedReviewDeliveryKey({ GROUPED_REVIEW_DELIVERY_ENCRYPTION_KEY_V1: key.toString("base64") })).toEqual(key);
    for (const value of [undefined, "", randomBytes(31).toString("base64"), key.toString("hex")]) {
      expect(() => parseGroupedReviewDeliveryKey({ GROUPED_REVIEW_DELIVERY_ENCRYPTION_KEY_V1: value })).toThrow();
    }
  });
  it("uses random nonces and authenticates ciphertext, key, and intent-bound AAD", () => {
    const path = generateGroupedReviewCredential().reviewPath;
    const first = encryptGroupedReviewDeliveryEnvelope(path, id, key); const second = encryptGroupedReviewDeliveryEnvelope(path, id, key);
    expect(first.nonce).not.toBe(second.nonce); expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(decryptGroupedReviewDeliveryEnvelope(first, id, key)).toBe(path);
    expect(() => decryptGroupedReviewDeliveryEnvelope(first, randomUUID(), key)).toThrow(/authentication failed/);
    expect(() => decryptGroupedReviewDeliveryEnvelope(first, id, randomBytes(32))).toThrow(/authentication failed/);
    expect(() => decryptGroupedReviewDeliveryEnvelope({ ...first, ciphertext: `A${first.ciphertext.slice(1)}` }, id, key)).toThrow(/authentication failed/);
    expect(() => decryptGroupedReviewDeliveryEnvelope({ ...first, keyVersion: 2 as 1 }, id, key)).toThrow(/Unsupported/);
  });
  it("decrypts after a fresh configuration load without reusing the process-A key object",()=>{
    const environment={GROUPED_REVIEW_DELIVERY_ENCRYPTION_KEY_V1:key.toString("base64")};const path=generateGroupedReviewCredential().reviewPath;
    const processAKey=parseGroupedReviewDeliveryKey(environment);const envelope=encryptGroupedReviewDeliveryEnvelope(path,id,processAKey);processAKey.fill(0);
    const processBKey=parseGroupedReviewDeliveryKey(environment);expect(processBKey).not.toBe(processAKey);expect(decryptGroupedReviewDeliveryEnvelope(envelope,id,processBKey)).toBe(path);
  });
});
