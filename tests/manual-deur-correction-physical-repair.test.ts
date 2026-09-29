import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260930000200_manual_deur_correction_physical_occurrence_repair.sql"), "utf8");
const action = readFileSync(resolve(process.cwd(), "src/features/rental/workspace/deur/RepairDeurCorrectionAction.tsx"), "utf8");
const contracts = readFileSync(resolve(process.cwd(), "src/features/rental/operations/commands/contracts.ts"), "utf8");
const repository = readFileSync(resolve(process.cwd(), "src/integrations/supabase/SupabaseOperationalCommandRepository.ts"), "utf8");

describe("manual DEUR correction physical-occurrence repair", () => {
  it("is a narrowly guarded canonical command with immutable source-derived time", () => {
    expect(migration).toContain("command_repair_manual_deur_correction_physical_occurrence");
    expect(migration).toContain("current_user_has_permission('deur.correct')");
    expect(migration).toContain("key NOT IN ('commandId','idempotencyKey','deurId','expectedVersion')");
    expect(migration).toContain("target.creation_source<>'MANUAL_WEB'");
    expect(migration).toContain("target.operational_metadata#>>'{sourceDocument}'<>'PHYSICAL_DEUR'");
    expect(migration).toContain("target.status<>'In Progress' OR target.previous_revision_id IS NULL");
    expect(migration).toContain("source.status<>'Rejected'");
    expect(migration).toContain("newer.revision_number>target.revision_number");
    expect(migration).toContain("action='SUBMIT_DEUR'");
    expect(migration).toContain("revision_id=target.id");
    expect(migration).toContain("billing_statement_lines");
    expect(migration).toContain("target_event.occurred_at IS NOT DISTINCT FROM source_event.occurred_at");
    expect(migration).toContain("SET occurred_at=source_event.occurred_at");
    expect(migration).toContain("DEUR_CORRECTION_PHYSICAL_OCCURRENCE_REPAIRED");
    expect(migration).toContain("finish_operational_command");
    expect(migration).not.toMatch(/command->>'clientOccurredAt'/);
  });

  it("exposes the command through the typed remote repository and guarded UI action", () => {
    expect(contracts).toContain("repairCorrectionPhysicalOccurrence");
    expect(repository).toContain("command_repair_manual_deur_correction_physical_occurrence");
    expect(action).toContain("Repair Correction Timeline");
    expect(action).toContain("repairCorrectionPhysicalOccurrence");
    expect(action).toContain("expectedVersion");
    expect(action).not.toContain("clientOccurredAt");
  });

  it("does not provide a generic event editor or destructive fallback", () => {
    expect(migration).not.toMatch(/DELETE\s+FROM\s+erp\.deur_events/i);
    expect(migration).not.toMatch(/UPDATE\s+erp\.deur_events\s+SET\s+(?!occurred_at)/i);
    expect(migration).toContain("source_event.id");
    expect(migration).toContain("target_event.id");
  });
});
