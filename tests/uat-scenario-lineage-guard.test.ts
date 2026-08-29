import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260829002200_isolated_uat_scenario_lineage_guard.sql", "utf8");

describe("isolated UAT scenario lineage guard", () => {
  it("derives every downstream domain from residue-rooted canonical keys", () => {
    for (const marker of [
      "uat_multi_equipment_provisioning_scenarios",
      "customer_review_batches b",
      "customer_review_batch_items i",
      "customer_review_requests r",
      "notification_outbox n",
      "source_aggregate_type='CUSTOMER_REVIEW_BATCH'",
      "notification_delivery_attempts a",
      "billing_statements b",
      "billing_statement_lines l",
      "operational_command_idempotency o",
      "RETURN_RENTAL_LINE",
      "RETURN_ALL_RENTAL_LINES",
    ]) expect(sql).toContain(marker);
  });

  it("fails closed for missing or malformed scenario roots and never performs writes", () => {
    expect(sql).toContain("SCENARIO_NOT_FOUND");
    expect(sql).toContain("SCENARIO_IDENTITY_INCOMPLETE");
    expect(sql).toContain("'UNPROVEN'");
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|MERGE)\s+(?:INTO\s+)?erp\./i);
  });

  it("returns SAFE only for proven zero counts and blocks every downstream artifact class", () => {
    for (const marker of [
      "'reviewArtifacts'",
      "'notificationArtifacts'",
      "'deliveryAttempts'",
      "'billingStatements'",
      "'invoices'",
      "'returnTransitions'",
      "'ALL_SCENARIO_LINEAGE_COUNTS_ZERO'",
    ]) expect(sql).toContain(marker);
  });
});
