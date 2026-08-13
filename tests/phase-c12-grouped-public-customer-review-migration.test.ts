import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = "supabase/migrations/20260803006100_phase_c12_grouped_customer_public_review.sql";
const migration = readFileSync(file, "utf8");

describe("Phase C12 grouped public Customer Review migration", () => {
  it("exists at 06100 without replacing the certified stack", () => {
    expect(readdirSync("supabase/migrations")).toContain("20260803006100_phase_c12_grouped_customer_public_review.sql");
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
  });

  it("adds lookup and both per-line wrappers", () => {
    expect(migration).toContain("CREATE FUNCTION erp.get_customer_review_batch(command jsonb)");
    expect(migration).toContain("CREATE FUNCTION erp.acknowledge_customer_review_batch_item(command jsonb)");
    expect(migration).toContain("CREATE FUNCTION erp.request_customer_review_batch_item_correction(command jsonb)");
  });

  it("validates and hashes only the raw credential while concealing misses", () => {
    expect(migration).toContain("coalesce(command->>'credential','') !~ '^[0-9a-f]{64}$'");
    expect(migration).toContain("extensions.digest(command->>'credential','sha256')");
    expect(migration).toContain("'INVALID_OR_UNAVAILABLE'");
    expect(migration).not.toMatch(/command->>'(?:tenantId|companyId|rentalId|deurId|revisionId|requestId)'/);
  });

  it("derives the canonical request and revision from the finalized batch item", () => {
    expect(migration).toContain("item_record.customer_review_request_id");
    expect(migration).toContain("item_record.deur_id");
    expect(migration).toContain("item_record.revision_id");
    expect(migration).toContain("WHERE batch_id = batch_record.id AND id = (command->>'publicItemId')::uuid");
    expect(migration).toContain("request.revision_version");
  });

  it("rejects expired, superseded, cross-batch, and non-actionable lines", () => {
    expect(migration).toContain("'code','EXPIRED'");
    expect(migration).toContain("'code','SUPERSEDED'");
    expect(migration).toContain("'code','NOT_ACTIONABLE'");
    expect(migration).toContain("batch_id = batch_record.id");
  });

  it("projects current canonical state without mutating frozen snapshots", () => {
    expect(migration).toContain("request.status = 'Acknowledged'");
    expect(migration).toContain("request.status = 'CorrectionRequested'");
    expect(migration).toContain("'PARTIALLY_REVIEWED'");
    expect(migration).not.toMatch(/UPDATE erp\.customer_review_batches SET summary_snapshot/i);
    expect(migration).not.toMatch(/UPDATE erp\.customer_review_batch_items SET item_snapshot/i);
  });

  it("writes only canonical outcome and correction evidence", () => {
    expect(migration).toContain("INSERT INTO erp.customer_review_outcomes");
    expect(migration).toContain("INSERT INTO erp.customer_correction_requests");
    expect(migration).not.toMatch(/CREATE TABLE/i);
    expect(migration).not.toMatch(/grouped_customer_review_outcome|grouped_customer_correction/i);
  });

  it("keeps the batch credential reusable and enforces per-item idempotency", () => {
    expect(migration).toContain("'public-grouped-review:'||batch_record.id::text||':'||item_record.id::text");
    expect(migration).toContain("'disposition','REPLAYED'");
    expect(migration).not.toMatch(/UPDATE erp\.customer_review_batches[\s\S]*credential/i);
    expect(migration).not.toMatch(/DELETE FROM erp\.customer_review_batches/i);
  });

  it("uses the exact anonymous function grants with no table grants", () => {
    expect(migration).toMatch(/ALTER FUNCTION erp\.get_customer_review_batch\(jsonb\) OWNER TO postgres/);
    expect(migration).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = erp, pg_catalog/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO anon/);
    expect(migration).not.toMatch(/GRANT .* ON (?:TABLE )?.* TO anon/i);
    expect(migration).not.toMatch(/DISABLE ROW LEVEL SECURITY|DISABLE TRIGGER|session_replication_role/i);
  });

  it("contains no grouped email, scheduler, provider, or unrelated approval implementation", () => {
    expect(migration).not.toMatch(/CUSTOMER_REVIEW_REQUESTED|INSERT INTO erp\.notification_outbox|cron|scheduler|provider worker/i);
    expect(migration).not.toMatch(/manager_rental|billing_statement.*approv|manager_deur.*retir/i);
  });
});
