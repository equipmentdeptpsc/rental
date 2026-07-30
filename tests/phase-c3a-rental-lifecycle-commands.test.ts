import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SupabaseOperationalCommandRepository } from "@/integrations/supabase/SupabaseOperationalCommandRepository";

const sql = fs.readFileSync(
  path.resolve("supabase/migrations/20260729000900_phase_c3a_rental_lifecycle_commands.sql"),
  "utf8",
);

describe("Phase C3A rental lifecycle SQL", () => {
  it("implements the canonical create/reserve, release, activate and cancellation surface", () => {
    for (const fn of [
      "command_create_reserved_rental",
      "command_release_rental",
      "command_activate_rental",
      "command_cancel_rental",
    ]) expect(sql).toContain(`FUNCTION ${fn}(command jsonb)`);
    expect(sql).toContain("'Reserved','Released'");
    expect(sql).toContain("'Released','Active'");
    expect(sql).toContain("state NOT IN('Draft','Assigned','Reserved')");
  });

  it("uses frozen permissions and authenticated tenant identity", () => {
    expect(sql).toContain("current_user_has_permission('rental.manage')");
    expect(sql).toContain("'rental.release'");
    expect(sql).toContain("id=auth.uid() AND status='active'");
    expect(sql).toContain("company_id=tenant");
    expect(sql).not.toMatch(/tenant\s*=\s*command->>'companyId'/);
  });

  it("validates atomic multi-equipment relationships and deterministic locks", () => {
    expect(sql).toContain("jsonb_array_elements(command->'lines')");
    expect(sql).toContain("count(DISTINCT item->>'equipmentId')");
    expect(sql).toContain("ORDER BY e.id FOR UPDATE");
    expect(sql).toContain("a.equipment_id=e.id AND a.operator_id=o.id AND a.project_id=project.id");
    expect(sql).toContain("existing_rental.status IN('Draft','Assigned','Reserved','Released','Active')");
  });

  it("uses optimistic concurrency, idempotency, safe audit output and safe failures", () => {
    expect(sql).toContain("begin_operational_command");
    expect(sql).toContain("finish_operational_command");
    expect(sql).toContain("rental.row_version<>coalesce((command->>'expectedVersion')::bigint");
    expect(sql).toContain("'IDEMPOTENCY_MISMATCH'");
    expect(sql).toContain("INSERT INTO audit_log");
    expect(sql).toContain("'PERSISTENCE_FAILURE'");
    expect(sql).not.toContain("SQLERRM");
  });

  it("protects cancellation evidence and equipment relationships", () => {
    expect(sql).toContain("EXISTS(SELECT 1 FROM deurs WHERE rental_id=rental.id)");
    expect(sql).toContain("EXISTS(SELECT 1 FROM billing_statements WHERE rental_id=rental.id");
    expect(sql).toContain("other_rental.status IN('Draft','Assigned','Reserved','Released','Active')");
  });

  it("has explicit grants and minimal security-definer search paths", () => {
    expect(sql).toContain("FROM PUBLIC,anon");
    expect(sql).toContain("TO authenticated");
    expect(sql).not.toMatch(/SET search_path\s*=[^;\n]*\bpublic\b/i);
    expect(sql).not.toContain("GRANT INSERT");
    expect(sql).not.toContain("GRANT UPDATE");
    expect(sql).not.toContain("GRANT DELETE");
  });
});

describe("Phase C3A Supabase adapter", () => {
  it("maps typed lifecycle methods to their RPCs", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { success: true, disposition: "ACCEPTED", serverOccurredAt: "2026-07-29T00:00:00Z", refresh: [], value: { rentalId: "r", status: "Reserved", version: 1 } },
      error: null,
    });
    const repository = new SupabaseOperationalCommandRepository({ schema: () => ({ rpc }) });
    const metadata = { commandId: "c", idempotencyKey: "i", rentalId: "r", expectedVersion: 1 };
    await repository.createReserved({ ...metadata, rentalNumber: "R-1", customerId: "c", projectId: "p", dateOut: "2026-07-29", rentalType: "Operated Rental", lines: [{ id: "l", equipmentId: "e", assignmentId: "a", operatorId: "o" }] });
    await repository.release(metadata);
    await repository.activate(metadata);
    await repository.cancel(metadata);
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      "command_create_reserved_rental", "command_release_rental",
      "command_activate_rental", "command_cancel_rental",
    ]);
  });
});
