import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const path = resolve(process.cwd(), "supabase/migrations/20260803005700_phase_c12_grouped_customer_review_foundation.sql");
const sql = readFileSync(path, "utf8");

describe("C12 grouped Customer Review foundation", () => {
  it("creates only the provider-neutral batch and item foundation", () => {
    expect(sql).toContain("CREATE TABLE erp.customer_review_batches");
    expect(sql).toContain("CREATE TABLE erp.customer_review_batch_items");
    expect(sql).not.toMatch(/CREATE (?:OR REPLACE )?FUNCTION|CREATE TRIGGER|notification_outbox|Resend/i);
    expect(sql).not.toMatch(/ALTER TABLE erp\.(customer_review_requests|customer_review_outcomes|customer_correction_requests|manager_review_requests|manager_review_outcomes|manager_correction_requests|deurs|billing_statements)/i);
  });

  it("uses the exact Rental-bearing group/date identity and timezone authority", () => {
    for (const field of ["company_id", "customer_id", "project_id", "rental_id", "review_date", "business_timezone"])
      expect(sql).toContain(field);
    expect(sql).toContain("company_id, customer_id, project_id, rental_id, review_date");
    expect(sql).toContain("WHERE superseded_at IS NULL");
    expect(sql).toContain("REFERENCES erp.rentals(company_id, id, customer_id, project_id, timezone)");
    expect(sql).toContain("must not fall back to UTC");
  });

  it("stores only a hashed expiring credential with supersession", () => {
    expect(sql).toContain("credential_hash text NOT NULL");
    expect(sql).toContain("credential_hash ~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("expires_at timestamptz NOT NULL");
    expect(sql).toContain("superseded_at timestamptz");
    expect(sql).toContain("superseded_by_batch_id uuid");
    expect(sql).not.toMatch(/\b(raw_credential|raw_token|credential_value|token_hash)\b/);
    expect(sql).not.toMatch(/\bstatus\s+text\b/);
  });

  it("enforces exact batch, line, DEUR, revision, request, and tenant relationships", () => {
    for (const constraint of [
      "customer_review_batch_items_batch_context_fk", "customer_review_batch_items_line_fk",
      "customer_review_batch_items_equipment_fk", "customer_review_batch_items_operator_fk",
      "customer_review_batch_items_deur_fk", "customer_review_batch_items_revision_fk",
      "customer_review_batch_items_request_fk",
    ]) expect(sql).toContain(constraint);
    expect(sql).toContain("REFERENCES erp.customer_review_requests(");
    expect(sql).toContain("company_id, id, rental_id, rental_equipment_line_id, deur_id, revision_id");
  });

  it("supports read-only In Progress items and exact actionable request items", () => {
    expect(sql).toContain("customer_review_request_id uuid");
    expect(sql).toContain("deur_id text");
    expect(sql).toContain("revision_id text");
    expect(sql).toContain("deur_id IS NULL AND revision_id IS NULL AND customer_review_request_id IS NULL");
    expect(sql).toContain("deur_id IS NOT NULL AND revision_id = deur_id");
    expect(sql).toContain("item_snapshot jsonb NOT NULL");
  });

  it("allows one unresolved request in different daily batches but not duplicate line revisions in one batch", () => {
    expect(sql).toContain("CREATE INDEX ix_customer_review_batch_items_request");
    expect(sql).not.toMatch(/UNIQUE[^;]+customer_review_request_id/is);
    expect(sql).toContain("uq_customer_review_batch_items_line_revision");
    expect(sql).toContain("batch_id, rental_equipment_line_id, coalesce(revision_id, '')");
  });

  it("keeps both tables private behind RLS", () => {
    for (const table of ["customer_review_batches", "customer_review_batch_items"]) {
      expect(sql).toContain(`ALTER TABLE erp.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`REVOKE ALL ON TABLE erp.${table}`);
    }
    expect(sql).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(sql).not.toMatch(/GRANT .+ TO (?:PUBLIC|anon|authenticated)/i);
  });

  it("does not modify the per-DEUR, Manager-DEUR, or billing workflows", () => {
    for (const forbidden of [
      "public_acknowledge_customer_review", "public_request_customer_correction",
      "manager_review_status", "command_create_manager_review_request",
      "calculate_deur_billing_evidence", "command_finalize_billing_statement",
    ]) expect(sql).not.toContain(forbidden);
  });
});
