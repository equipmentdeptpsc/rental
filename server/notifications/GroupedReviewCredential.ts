import { createHash, randomBytes } from "node:crypto";

export interface GroupedReviewCredential { raw: string; hash: string; reviewPath: string }

export function hashGroupedReviewCredential(raw: string): string {
  if (!/^[0-9a-f]{64}$/.test(raw)) throw new Error("Invalid grouped review credential.");
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function generateGroupedReviewCredential(): GroupedReviewCredential {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashGroupedReviewCredential(raw), reviewPath: `/review/customer/grouped/${raw}` };
}
