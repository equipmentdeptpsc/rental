import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SupabaseBillingStatementEmailCommandRepository } from "@/features/rental/billing-email/BillingStatementEmailCommandRepository";

const panel = readFileSync("src/features/rental/workspace/billing/BillingPanel.tsx", "utf8");
const managerPanel = readFileSync("src/features/rental/components/ManagementBillingApprovals.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261008000100_uat_management_approval_guards.sql", "utf8");

describe("scoped billing approval control", () => {
  it("removes the protected fixture-specific approval action from the billing workspace", () => {
    expect(panel).not.toContain("UAT_STATEMENT_ID");
    expect(panel).not.toContain("UAT_RENTAL_ID");
    expect(panel).not.toContain("Approve UAT billing statement");
  });

  it("only exposes the manager approval action with scoped permission and version", () => {
    expect(managerPanel).toContain('hasPermission("billing.approve")');
    expect(managerPanel).toContain("expectedVersion");
    expect(managerPanel).toContain('rpc("command_finalize_billing_statement"');
    expect(managerPanel).not.toContain('hasPermission("billing.update")');
  });

  it("keeps idempotency and an audit record in the finalization command", () => {
    expect(migration).toContain("current_user_has_permission('billing.approve')");
    expect(migration).toContain("idem->>'state'='REPLAY'");
    expect(migration).toContain("erp.finish_operational_command");
    expect(migration).toContain("INSERT INTO erp.audit_log");
  });

  it("shows the server approval rejection without queuing a customer email", async () => {
    const message = "Operations Manager approval is required before this billing statement can be sent to the customer.";
    const repository = new SupabaseBillingStatementEmailCommandRepository({ schema: () => ({ rpc: async () => ({ data: null, error: { message } }) }) });
    await expect(repository.enqueue({ statementId: "local-test", commandId: "command", idempotencyKey: "idem", expectedVersion: 1 }))
      .resolves.toEqual({ success: false, code: "APPROVAL_REQUIRED", message });
  });

  it("turns an unapproved statement response into the customer-facing approval message", async () => {
    const repository = new SupabaseBillingStatementEmailCommandRepository({ schema: () => ({ rpc: async () => ({ data: { success: false, code: "INVALID_TRANSITION", message: "Only an approved Billing Statement can be emailed." }, error: null }) }) });
    await expect(repository.enqueue({ statementId: "local-test", commandId: "command", idempotencyKey: "idem", expectedVersion: 1 }))
      .resolves.toEqual({ success: false, code: "APPROVAL_REQUIRED", message: "Operations Manager approval is required before this billing statement can be sent to the customer." });
  });
});
