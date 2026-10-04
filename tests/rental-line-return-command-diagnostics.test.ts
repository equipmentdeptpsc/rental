import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261004000600_diagnose_rental_line_return_validation.sql",
  "utf8",
);

describe("canonical rental-line return diagnostic migration", () => {
  it("corrects the ISO return-date guard without weakening it", () => {
    expect(migration).toContain("command->>'actualReturnDate' !~ '^\\d{4}-\\d{2}-\\d{2}$'");
    expect(migration).not.toContain("!~ '^\\\\d{4}-\\\\d{2}-\\\\d{2}$'");
  });

  it("keeps the guard order and exposes stable non-secret reason codes", () => {
    const dateIndex = migration.indexOf("reasonCode', 'INVALID_RETURN_DATE");
    const lineIndex = migration.indexOf("reasonCode', 'LINE_NOT_FOUND");
    const versionIndex = migration.indexOf("reasonCode', 'VERSION_MISMATCH");
    const deurIndex = migration.indexOf("reasonCode', 'OPEN_DEUR_WORK");
    expect(dateIndex).toBeGreaterThan(-1);
    expect(lineIndex).toBeGreaterThan(dateIndex);
    expect(versionIndex).toBeGreaterThan(lineIndex);
    expect(deurIndex).toBeGreaterThan(versionIndex);
    expect(migration).toContain("reasonCode', 'LINE_EQUIPMENT_MISMATCH");
    expect(migration).toContain("reasonCode', 'LINE_ASSIGNMENT_MISMATCH");
    expect(migration).toContain("reasonCode', 'COMMAND_INVALID");
    expect(migration).toContain("reasonCode', 'AVAILABLE_EQUIPMENT_STATUS_MISSING");
  });

  it("does not add a return mutation path or weaken concurrency/idempotency", () => {
    expect(migration).toContain("erp.begin_operational_command(command, 'RETURN_RENTAL_LINE'");
    expect(migration).toContain("target_line.row_version <> coalesce((command->>'expectedVersion')::bigint, target_line.row_version)");
    expect(migration).toContain("erp.finish_operational_command(command, 'RETURN_RENTAL_LINE'");
    expect(migration).toContain("AND deur.status IN ('Draft', 'In Progress', 'Submitted', 'Pending Acknowledgement', 'Rejected')");
  });
});
