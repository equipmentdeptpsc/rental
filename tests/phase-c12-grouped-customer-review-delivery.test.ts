import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderNotificationTemplate } from "@/features/notifications/templates";
import { FakeEmailDeliveryProvider } from "../server/notifications/FakeEmailDeliveryProvider";
import { TrustedReviewIssuanceOrchestrator, type TrustedReviewIssuanceRepository } from "../server/notifications/TrustedReviewIssuanceOrchestrator";

const migration = readFileSync("supabase/migrations/20260803006200_phase_c12_grouped_customer_review_delivery.sql", "utf8");
const groupedInput = {
  recipientName: "Customer <Lead>", companyName: "UAT & Equipment", customerName: "Customer One",
  projectName: "Project Alpha", rentalReference: "RENTAL-001", reviewDate: "2026-08-11",
  totalLineCount: 3, actionableCount: 2, inProgressCount: 1, acknowledgedCount: 0,
  correctionRequestedCount: 0, expirationLabel: "2026-08-18",
  reviewUrl: "https://psc-ed.equipmentdept-psc.workers.dev/review/customer/grouped/opaque?a=1&b=2",
};

describe("Phase C12 grouped Customer Review delivery migration", () => {
  it("introduces exactly one canonical grouped notification per batch", () => {
    expect(migration).toContain("CUSTOMER_GROUPED_REVIEW_REQUESTED");
    expect(migration).toContain("uq_customer_grouped_review_notification_per_batch");
    expect(migration).toContain("customer-grouped-review:'||batch_record.id::text||':v1");
    expect(migration).toContain("ON CONFLICT(company_id,idempotency_key) DO NOTHING");
  });

  it("wraps trusted generation and suppresses non-actionable delivery", () => {
    expect(migration).toContain("generated:=erp.command_generate_customer_review_batch(command)");
    expect(migration).toContain("'NO_ACTIONABLE_ITEMS'");
    expect(migration).toContain("actionableCount");
    expect(migration).not.toMatch(/cron|scheduler|reminder/i);
  });

  it("derives recipient, batch evidence, and secure path server-side", () => {
    expect(migration).toContain("rental_record.customer_review_name_snapshot");
    expect(migration).toContain("rental_record.customer_review_email_snapshot");
    expect(migration).toContain("'/review/customer/grouped/'||raw_credential");
    expect(migration).not.toMatch(/command->>'(?:recipient|email|companyId|customerId|projectId|batchId|reviewUrl)'/);
  });

  it("never persists the raw credential or unsafe authority in the payload", () => {
    const insert = migration.match(/INSERT INTO erp\.notification_outbox\(([\s\S]*?)\) VALUES\(([\s\S]*?)\) ON CONFLICT/);
    expect(insert?.[1].replace("requires_review_credential", "")).not.toMatch(/credential|token|review_url/i);
    expect(insert?.[2]).not.toContain("raw_credential");
    expect(migration).not.toMatch(/ADD COLUMN[\s\S]{0,80}(?:credential|token)/i);
  });

  it("preserves grouped request suppression and legacy SINGLE behavior", () => {
    const generation = readFileSync("supabase/migrations/20260803005900_phase_c12_grouped_customer_review_generation.sql", "utf8");
    expect(generation).toContain("IF NEW.issuance_mode='GROUPED' THEN RETURN NEW; END IF;");
    expect(generation).toContain("DEFAULT 'SINGLE'");
    expect(migration).not.toContain("CREATE OR REPLACE FUNCTION erp.enqueue_customer_review_notification");
  });

  it("uses authenticated execution and expands only one provider-attempt cleanup guard", () => {
    expect(migration).toMatch(/SECURITY DEFINER[\s\S]*SET search_path=erp,auth,pg_catalog/);
    expect(migration).toContain("ALTER FUNCTION erp.trusted_issue_customer_review_batch(jsonb) OWNER TO postgres");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.trusted_issue_customer_review_batch(jsonb) TO authenticated");
    expect(migration).toContain("notification_delivery_attempts WHERE company_id=target_tenant_id)>1");
    expect(migration).not.toMatch(/GRANT .* ON (?:TABLE )?erp\.notification/i);
  });
});

describe("grouped Customer Review email template", () => {
  it("renders grouped context, counts, secure CTA, fallback, and line-by-line guidance", () => {
    const email = renderNotificationTemplate("CUSTOMER_GROUPED_REVIEW_REQUESTED", groupedInput);
    expect(email.subject).toMatch(/Grouped DEUR review requested/);
    for (const evidence of ["UAT & Equipment", "Customer One", "Project Alpha", "RENTAL-001", "2026-08-11", "Total equipment lines: 3", "Awaiting acknowledgement: 2", "In Progress: 1"]) expect(email.text).toContain(evidence);
    expect(email.text).toContain(groupedInput.reviewUrl); expect(email.text).toContain("line-by-line");
    expect(email.html).toContain("REVIEW &amp; ACKNOWLEDGE DEURs"); expect(email.html).toContain("min-width:260px");
    expect(email.html).toContain("UAT &amp; Equipment"); expect(email.html).toContain("Customer &lt;Lead&gt;");
    expect(email.html).toContain("a=1&amp;b=2"); expect(`${email.text}${email.html}`).not.toMatch(/acknowledge all|one click/i);
  });
});

describe("trusted grouped issuance orchestration", () => {
  it("delivers once, uses the grouped path, and redacts the one-time handoff", async () => {
    const provider = new FakeEmailDeliveryProvider("success"); let issued = 0; let claimed = false;
    const repository: TrustedReviewIssuanceRepository = {
      issue: async () => ++issued === 1 ? { success: true, disposition: "CREATED", reviewPath: "/review/customer/grouped/opaque", notificationIntentId: "intent-1" } : { success: true, disposition: "REPLAYED" },
      getIntent: async () => ({ id: "intent-1", companyId: "tenant", type: "CUSTOMER_GROUPED_REVIEW_REQUESTED", recipient: { destination: "canonical@example.invalid", displayName: "Customer" }, sourceAggregateType: "CUSTOMER_REVIEW_BATCH", sourceAggregateId: "batch", templateVersion: 3, idempotencyKey: "grouped-batch", requiresReviewCredential: true, attempt: 0, input: { ...groupedInput, reviewUrl: undefined } }),
      claim: async () => claimed ? false : (claimed = true), claimBatch: async () => [], complete: vi.fn(),
    };
    const service = new TrustedReviewIssuanceOrchestrator(repository, provider, "sender@example.invalid", "https://psc-ed.equipmentdept-psc.workers.dev");
    const first = await service.issue("grouped-customer", {}); const replay = await service.issue("grouped-customer", {});
    expect(first).toMatchObject({ success: true, deliveryStatus: "ProviderAccepted" }); expect(replay.disposition).toBe("REPLAYED");
    expect(provider.evidence().callCount).toBe(1); expect(JSON.stringify(first)).not.toContain("/review/customer/grouped/opaque");
  });
});
