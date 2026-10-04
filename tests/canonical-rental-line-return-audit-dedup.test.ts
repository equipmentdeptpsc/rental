import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const triggerMigration = readFileSync("supabase/migrations/20261004000500_audit_canonical_rental_line_returns.sql", "utf8");
const commandMigration = readFileSync("supabase/migrations/20261004000600_diagnose_rental_line_return_validation.sql", "utf8");
const returnAllMigration = readFileSync("supabase/migrations/20260914000200_parent_rental_terminal_lifecycle_remediation.sql", "utf8");
const dedupMigration = readFileSync("supabase/migrations/20261004000700_remove_redundant_rental_line_return_audit_trigger.sql", "utf8");

describe("canonical rental-line return audit deduplication", () => {
  it("removes only the redundant 00500 trigger and preserves history", () => {
    expect(triggerMigration).toContain("CREATE TRIGGER audit_canonical_rental_line_return");
    expect(dedupMigration).toContain("DROP TRIGGER IF EXISTS audit_canonical_rental_line_return ON erp.rental_equipment_lines");
    expect(dedupMigration).toContain("DROP FUNCTION IF EXISTS erp.audit_canonical_rental_line_return()");
    expect(dedupMigration).not.toMatch(/DELETE\s+FROM\s+erp\.audit_log/i);
  });

  it("keeps exactly one command-authored audit path for per-line Return", () => {
    expect(commandMigration).toContain("UPDATE erp.rental_equipment_lines");
    expect(commandMigration).toContain("'RETURN_RENTAL_LINE', auth.uid()::text");
    expect(commandMigration).toContain("command->>'commandId'");
  });

  it("makes Return All line-level coverage come from its per-line children", () => {
    const returnAllStart = returnAllMigration.indexOf("CREATE OR REPLACE FUNCTION erp.command_return_all_rental_lines(command jsonb)");
    const returnAllEnd = returnAllMigration.indexOf("CREATE OR REPLACE FUNCTION erp.command_cancel_rental(command jsonb)");
    const returnAll = returnAllMigration.slice(returnAllStart, returnAllEnd);
    expect(returnAll).toContain("erp.command_return_rental_line(command || jsonb_build_object(");
    expect(returnAll).not.toMatch(/INSERT\s+INTO\s+erp\.audit_log/i);
    expect(returnAll).toContain("'RETURN_ALL_RENTAL_LINES'");
  });
});
