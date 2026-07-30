import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SupabaseOperationalCommandRepository } from "@/integrations/supabase/SupabaseOperationalCommandRepository";

const sql = fs.readFileSync(
  path.resolve("supabase/migrations/20260729001300_phase_c3c_recovery_commands.sql"),
  "utf8",
);

describe("Phase C3C recovery SQL", () => {
  it("defines only the approved recovery command surface", () => {
    for (const name of [
      "command_reopen_rental", "command_reverse_rental_return",
      "command_void_billing_statement", "command_release_deur_consumption",
      "command_cancel_invoice",
    ]) expect(sql).toContain(`FUNCTION ${name}(command jsonb)`);
    expect(sql).not.toContain("command_delete");
    expect(sql).not.toContain("command_refund");
  });

  it("records immutable forward compensation evidence without deleting history", () => {
    expect(sql).toContain("CREATE TABLE recovery_compensations");
    expect(sql).toContain("recovery_compensations_immutable");
    expect(sql).toContain("original_reference");
    expect(sql).toContain("prior_state jsonb NOT NULL");
    expect(sql).toContain("resulting_state jsonb NOT NULL");
    expect(sql).toContain("prior_version bigint NOT NULL");
    expect(sql).toContain("resulting_version bigint NOT NULL");
    expect(sql).not.toMatch(/DELETE FROM (rentals|deurs|billing_statements|billing_statement_lines|audit_log|operational_command_idempotency)/i);
  });

  it("preserves billing lines while making released consumption explicitly inactive", () => {
    expect(sql).toContain("consumption_released_at");
    expect(sql).toContain("WHERE consumption_released_at IS NULL");
    expect(sql).toContain("erp.deur_consumption_release");
    expect(sql).toContain("OLD.consumption_released_at IS NULL");
    expect(sql).toContain("NEW.consumption_released_at IS NOT NULL");
  });

  it("uses frozen permissions and authenticated tenant identity", () => {
    expect(sql).toContain("current_user_has_permission('rental.manage')");
    expect(sql).toContain("current_user_has_permission('rental.return')");
    expect(sql).toContain("current_user_has_permission('billing.update')");
    expect(sql).toContain("id=actor AND status='active'");
    expect(sql).not.toMatch(/tenant\s*=\s*command->>'companyId'/);
    expect(sql).not.toContain("system-administrator");
  });

  it("guards state, downstream evidence, versions, idempotency and collections", () => {
    expect(sql).toContain("'DOWNSTREAM_EVIDENCE_EXISTS'");
    expect(sql).toContain("'RECOVERY_NOT_ALLOWED'");
    expect(sql).toContain("'ALREADY_REVERSED'");
    expect(sql).toContain("row_version<>coalesce((command->>'expectedVersion')::bigint");
    expect(sql).toContain("begin_operational_command");
    expect(sql).toContain("finish_operational_command");
    expect(sql).toContain("'IDEMPOTENCY_MISMATCH'");
    expect(sql).toContain("EXISTS(SELECT 1 FROM collections");
  });

  it("uses explicit grants and minimal security-definer paths", () => {
    expect(sql).toContain("FROM PUBLIC,anon");
    expect(sql).toContain("TO authenticated");
    expect(sql).not.toMatch(/SET search_path\s*=[^;\n]*\bpublic\b/i);
    expect(sql).not.toContain("SQLERRM");
  });
});

describe("Phase C3C Supabase adapter", () => {
  it("maps the five typed recovery operations without fallback", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { success: true, disposition: "ACCEPTED", serverOccurredAt: "2026-07-29T00:00:00Z", refresh: [], value: {} },
      error: null,
    });
    const repository = new SupabaseOperationalCommandRepository({ schema: () => ({ rpc }) });
    const rental = { commandId: "c", idempotencyKey: "i", expectedVersion: 1, reason: "Approved UAT recovery", rentalId: "r" };
    const financial = { commandId: "c", idempotencyKey: "i", expectedVersion: 1, reason: "Approved UAT recovery", statementId: "s" };
    await repository.reopenRental(rental);
    await repository.reverseRentalReturn(rental);
    await repository.voidBillingStatement(financial);
    await repository.releaseDeurConsumption({ ...financial, deurId: "d" });
    await repository.cancelInvoice(financial);
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      "command_reopen_rental", "command_reverse_rental_return",
      "command_void_billing_statement", "command_release_deur_consumption",
      "command_cancel_invoice",
    ]);
  });
});
