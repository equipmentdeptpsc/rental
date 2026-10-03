import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const panel = readFileSync("src/features/rental/workspace/billing/BillingPanel.tsx", "utf8");
const repository = readFileSync("src/integrations/supabase/SupabaseOperationalCommandRepository.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260729001000_phase_c3b_billing_commands.sql", "utf8");

describe("UAT billing approval control", () => {
  it("is narrowly scoped to the UAT statement and host", () => {
    expect(panel).toContain("window.location.hostname === UAT_APPROVAL_HOST");
    expect(panel).toContain("statement.id === UAT_STATEMENT_ID");
    expect(panel).toContain('statement.approvalStatus === "Draft"');
    expect(panel).toContain('statement.invoiceStatus === "Not Invoiced"');
    expect(panel).toContain("statement.grandTotal === 1000");
  });

  it("uses confirmation, permission, single-flight, and the canonical repository", () => {
    expect(panel).toContain('hasPermission("billing.update")');
    expect(panel).toContain("window.confirm");
    expect(panel).toContain("approvalAttempted");
    expect(panel).toContain("finalizeStatement");
    expect(panel).toContain("onClick={() => void approveUatStatement()}");
    expect(panel).not.toContain("createInvoice");
    expect(panel).not.toContain("recordCollection");
  });

  it("maps the repository to the canonical finalize RPC with audited auth", () => {
    expect(repository).toContain('finalizeStatement = (input: BillingCommandInput) => this.rpc<BillingLifecycleProjection>("command_finalize_billing_statement", input)');
    expect(migration).toContain("current_user_has_permission('billing.update')");
    expect(migration).toContain("actor=auth.uid()::text");
    expect(migration).toContain("FINALIZE_BILLING_STATEMENT");
    expect(migration).toContain("statement.approval_status<>required_approval");
  });
});
