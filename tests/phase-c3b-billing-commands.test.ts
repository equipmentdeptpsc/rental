import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SupabaseOperationalCommandRepository } from "@/integrations/supabase/SupabaseOperationalCommandRepository";

const sql = fs.readFileSync(
  path.resolve("supabase/migrations/20260729001000_phase_c3b_billing_commands.sql"),
  "utf8",
);
const numberingFix = fs.readFileSync(
  path.resolve("supabase/migrations/20260729001100_phase_c3b_statement_number_fix.sql"),
  "utf8",
);
const duplicateFix = fs.readFileSync(
  path.resolve("supabase/migrations/20260729001200_phase_c3b_duplicate_classification_fix.sql"),
  "utf8",
);

describe("Phase C3B billing command SQL", () => {
  it("defines the complete billing, consumption, statement and invoice surface", () => {
    for (const name of [
      "command_generate_billing_evidence", "command_consume_deur",
      "command_create_billing_statement", "command_finalize_billing_statement",
      "command_create_invoice", "command_update_invoice",
    ]) expect(sql).toContain(`FUNCTION ${name}(command jsonb)`);
  });

  it("preserves the approved calculation matrix and rejects cubic-meter automation", () => {
    for (const method of ["Per Hour", "Per Day", "Per Week", "Per Month", "One Lot"]) {
      expect(sql).toContain(`'${method}'`);
    }
    expect(sql).toContain("greatest(source.total_operating_minutes::numeric/60,coalesce(terms.minimum_billable_hours,0))");
    expect(sql).toContain("method='Per Cubic Meter'");
    expect(sql).toContain("'UNSUPPORTED_BILLING_METHOD'");
    expect(sql).toContain("subtotal+vat_amount-withholding");
  });

  it("enforces authenticated tenant scope and frozen finance permissions", () => {
    expect(sql).toContain("id=auth.uid() AND status='active'");
    expect(sql).toContain("current_user_has_permission('billing.create')");
    expect(sql).toContain("current_user_has_permission('billing.update')");
    expect(sql).toContain("company_id=tenant");
    expect(sql).not.toMatch(/tenant\s*=\s*command->>'companyId'/);
  });

  it("protects duplicate consumption, concurrency, idempotency, and atomic audit", () => {
    expect(sql).toContain("source.billing_locked");
    expect(sql).toContain("source.row_version<>coalesce((command->>'expectedVersion')::bigint");
    expect(sql).toContain("statement.row_version<>coalesce((command->>'expectedVersion')::bigint");
    expect(sql).toContain("begin_operational_command");
    expect(sql).toContain("finish_operational_command");
    expect(sql).toContain("'IDEMPOTENCY_MISMATCH'");
    expect(sql).toContain("INSERT INTO audit_log");
    expect(sql).toContain("WHEN unique_violation");
    expect(sql).not.toContain("SQLERRM");
  });

  it("keeps recovery out of scope and grants RPCs narrowly", () => {
    expect(sql).not.toContain("command_reverse");
    expect(sql).not.toContain("command_delete_invoice");
    expect(sql).toContain("FROM PUBLIC,anon");
    expect(sql).toContain("TO authenticated");
    expect(sql).not.toMatch(/SET search_path\s*=[^;\n]*\bpublic\b/i);
  });

  it("uses an unambiguous tenant-scoped statement sequence in the forward fix", () => {
    expect(numberingFix).toContain("target_year integer");
    expect(numberingFix).toContain("VALUES(tenant,'BILLING_STATEMENT',target_year,1,'BS')");
    expect(numberingFix).toContain("ON CONFLICT(company_id,scope,sequence_year)");
    expect(numberingFix).not.toContain("sequence_year integer=");
  });

  it("classifies an existing billing link before general eligibility", () => {
    expect(duplicateFix.indexOf("source.billing_locked")).toBeLessThan(
      duplicateFix.indexOf("source.status<>'Acknowledged'"),
    );
    expect(duplicateFix).toContain("'DUPLICATE_CONSUMPTION'");
  });
});

describe("Phase C3B Supabase adapter", () => {
  it("maps strongly typed operations to the six RPCs", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { success: true, disposition: "ACCEPTED", serverOccurredAt: "2026-07-29T00:00:00Z", refresh: [], value: {} },
      error: null,
    });
    const repository = new SupabaseOperationalCommandRepository({ schema: () => ({ rpc }) });
    const metadata = { commandId: "command", idempotencyKey: "idem", expectedVersion: 1 };
    await repository.generateEvidence({ ...metadata, deurId: "deur" });
    await repository.createStatement({ ...metadata, statementId: "statement", rentalId: "rental", billingFrom: "2026-07-01", billingTo: "2026-07-31" });
    await repository.consumeDeur({ ...metadata, statementId: "statement", deurId: "deur" });
    await repository.finalizeStatement({ ...metadata, statementId: "statement" });
    await repository.createInvoice({ ...metadata, statementId: "statement" });
    await repository.updateInvoice({ ...metadata, statementId: "statement", invoiceStatus: "Fully Collected" });
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      "command_generate_billing_evidence", "command_create_billing_statement", "command_consume_deur",
      "command_finalize_billing_statement", "command_create_invoice", "command_update_invoice",
    ]);
  });
});
