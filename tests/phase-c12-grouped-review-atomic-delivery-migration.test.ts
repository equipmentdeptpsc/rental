import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260803006300_phase_c12_grouped_review_atomic_delivery_envelope.sql", "utf8");
describe("C12 grouped review atomic delivery migration", () => {
  it("stores only encrypted, intent-bound delivery material behind RLS", () => {
    for (const marker of ["notification_delivery_envelopes", "ciphertext", "nonce", "auth_tag", "key_version", "ENABLE ROW LEVEL SECURITY", "FROM PUBLIC,anon,authenticated,service_role"]) expect(sql).toContain(marker);
    const table = sql.slice(sql.indexOf("CREATE TABLE erp.notification_delivery_envelopes"), sql.indexOf("ALTER TABLE erp.notification_delivery_envelopes OWNER"));
    expect(table).not.toMatch(/\n\s+(review_path|raw_credential|encryption_key)\s+(text|varchar|bytea)/i);
    expect(sql).toContain("notification_id uuid PRIMARY KEY");
  });
  it("keeps one business generator and exposes atomic preparation only to service role", () => {
    expect(sql).toContain("internal_generate_customer_review_batch(command jsonb,credential_hash text)");
    expect(sql).toContain("trusted_prepare_grouped_customer_review_delivery(command jsonb)");
    expect(sql).toContain("'credentialHash'"); expect(sql).toContain("'envelopeType'"); expect(sql).not.toContain("'rawCredential'");
    expect(sql).toContain("auth.role()<>'service_role'");
    expect(sql).toContain("TO service_role"); expect(sql).not.toMatch(/trusted_prepare_grouped_customer_review_delivery\(jsonb\).*TO authenticated/s);
  });
  it("preserves legacy generation, retry, retirement, and exact cleanup", () => {
    expect(sql).toContain("command_generate_customer_review_batch(jsonb)");
    expect(sql).toContain("claim_notification_delivery_batch"); expect(sql).toContain("retired_at=now_at");
    expect(sql).toContain("DELETE FROM notification_delivery_envelopes e USING notification_outbox n");
    expect(sql).not.toMatch(/cron|scheduler/i);
  });
});
