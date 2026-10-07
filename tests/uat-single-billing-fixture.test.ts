import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261003000400_isolated_uat_single_billing_fixture.sql", "utf8");
const worker = readFileSync("worker/uatSingleBillingFixture.ts", "utf8");
const index = readFileSync("worker/index.ts", "utf8");

describe("isolated UAT single-rental billing fixture contract", () => {
  it("uses a unique fixture key and UAT-only guards", () => {
    expect(migration).toContain("BILLING_SINGLE_RENTAL_V1");
    expect(migration).toContain("UAT_BILLING_SINGLE_RENTAL_V1");
    expect(migration).toContain("TENANT-LOCAL-001");
    expect(worker).toContain("ENABLE_UAT_SYNTHETIC_PROVISIONER !== \"true\"");
    expect(worker).toContain("system-administrator");
  });

  it("claims one idempotent scenario and refuses profile/partial ambiguity", () => {
    expect(migration).toContain("PRIMARY KEY(company_id,scenario_key)");
    expect(migration).toContain("SCENARIO_PROFILE_MISMATCH");
    expect(migration).toContain("PROVISIONING");
    expect(migration).toContain("FIXTURE_INCOMPLETE");
    expect(worker).toContain("claim_uat_single_billing_fixture");
    expect(worker).toContain("if (claim.state === \"READY\")");
  });

  it("creates exactly one rental line and positive per-hour evidence", () => {
    expect(worker).toContain("rentalEquipmentLineId: scenario.lineId");
    expect(worker).toContain('billingMethod: "Per Hour"');
    expect(worker).toContain("unitRate: 1000");
    expect(worker).toContain("activityType: \"operation\"");
    expect(migration).toContain("positiveBillableEvidence");
  });

  it("acknowledges through the canonical public-review command without delivery", () => {
    expect(worker).toContain("command_create_customer_review_request");
    expect(worker).toContain("acknowledge_uat_single_billing_fixture_review");
    expect(worker).not.toContain("dispatchExistingNotification");
    expect(worker).not.toContain("runUatGroupedReviewCertification");
    expect(migration).toContain("billingStatements");
    expect(migration).toContain("collections");
  });

  it("exposes separate provision and read-only inspection endpoints", () => {
    expect(index).toContain("/api/admin/uat/provision-single-billing-fixture");
    expect(index).toContain("/api/admin/uat/inspect-single-billing-fixture");
    expect(index).toContain("inspectUatSingleBillingFixture");
  });

  it("does not contain billing creation or provider delivery in the fixture worker", () => {
    expect(worker).not.toContain("command_create_billing");
    expect(worker).not.toContain("command_send_billing_statement_email");
    expect(worker).not.toContain("runNotificationWorker");
  });
});
