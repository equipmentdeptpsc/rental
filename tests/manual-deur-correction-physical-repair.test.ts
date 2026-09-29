import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SupabaseOperationalCommandRepository } from "@/integrations/supabase/SupabaseOperationalCommandRepository";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260930000200_manual_deur_correction_physical_occurrence_repair.sql"), "utf8");
const aliasMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260930000300_manual_deur_correction_repair_source_alias.sql"), "utf8");
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

  it("qualifies the source DEUR record to avoid source-column ambiguity", () => {
    expect(aliasMigration).toContain("source_deur erp.deurs%ROWTYPE");
    expect(aliasMigration).toContain("erp.is_manual_deur_encoding_bootstrap_event(source_deur,event_record)");
    expect(aliasMigration).toContain("event_record.deur_id=source_deur.id");
    expect(aliasMigration).not.toContain("is_manual_deur_encoding_bootstrap_event(source,event_record)");
    expect(aliasMigration).toContain("REPAIR_DEUR_CORRECTION_PHYSICAL_OCCURRENCE");
  });

  it("preserves a sanitized PostgREST transport diagnostic without implying success", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        status: 404,
        message: "Could not find function erp.command_repair_manual_deur_correction_physical_occurrence(jsonb) in the schema cache",
        details: "schema cache lookup failed",
        hint: "Refresh the API schema",
      },
    });
    const repository = new SupabaseOperationalCommandRepository({ schema: () => ({ rpc }) } as never);
    const result = await repository.repairCorrectionPhysicalOccurrence({ commandId: "cmd-1", idempotencyKey: "idem-1", deurId: "deur-1", expectedVersion: 4 });
    expect(result).toMatchObject({
      success: false,
      code: "TRANSPORT_FAILURE",
      retryable: true,
      refreshRequired: true,
      details: { remoteCode: "PGRST202", httpStatus: 404, remoteMessage: expect.stringContaining("Could not find function") },
    });
    expect(result.message).toContain("Could not find function");
    expect(result.details).toMatchObject({ remoteDetails: "schema cache lookup failed", remoteHint: "Refresh the API schema" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("redacts sensitive transport text and never maps it to success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "XX000", message: "password=super-secret token=abc123" } });
    const repository = new SupabaseOperationalCommandRepository({ schema: () => ({ rpc }) } as never);
    const result = await repository.repairCorrectionPhysicalOccurrence({ commandId: "cmd-2", idempotencyKey: "idem-2", deurId: "deur-1", expectedVersion: 4 });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain("super-secret");
    expect(JSON.stringify(result)).not.toContain("abc123");
  });

  it("recognizes accepted, validation, and version-conflict repair contracts", async () => {
    const acceptedRpc = vi.fn().mockResolvedValue({ data: { success: true, disposition: "ACCEPTED", serverOccurredAt: "2026-09-30T00:00:00Z", refresh: ["deur-1"], value: { deurId: "deur-1", eventId: "event-1", sourceEventId: "source-1", restoredOccurredAt: "2026-09-28T13:35:00Z", version: 5 } }, error: null });
    const accepted = await new SupabaseOperationalCommandRepository({ schema: () => ({ rpc: acceptedRpc }) } as never).repairCorrectionPhysicalOccurrence({ commandId: "cmd-3", idempotencyKey: "idem-3", deurId: "deur-1", expectedVersion: 4 });
    expect(accepted).toMatchObject({ success: true, disposition: "ACCEPTED", value: { restoredOccurredAt: "2026-09-28T13:35:00Z", version: 5 } });

    const rejectedRpc = vi.fn().mockResolvedValue({ data: { success: false, code: "CORRECTION_REPAIR_NOT_ELIGIBLE", message: "Only an In Progress correction revision can be repaired.", retryable: false, refreshRequired: false }, error: null });
    const rejected = await new SupabaseOperationalCommandRepository({ schema: () => ({ rpc: rejectedRpc }) } as never).repairCorrectionPhysicalOccurrence({ commandId: "cmd-4", idempotencyKey: "idem-4", deurId: "deur-1", expectedVersion: 4 });
    expect(rejected).toMatchObject({ success: false, code: "CORRECTION_REPAIR_NOT_ELIGIBLE", retryable: false, refreshRequired: false });

    const conflictRpc = vi.fn().mockResolvedValue({ data: { success: false, code: "CONFLICT", message: "The correction revision changed. Refresh before retrying.", retryable: false, refreshRequired: true, currentVersion: 5 }, error: null });
    const conflict = await new SupabaseOperationalCommandRepository({ schema: () => ({ rpc: conflictRpc }) } as never).repairCorrectionPhysicalOccurrence({ commandId: "cmd-5", idempotencyKey: "idem-5", deurId: "deur-1", expectedVersion: 4 });
    expect(conflict).toMatchObject({ success: false, code: "CONFLICT", currentVersion: 5, refreshRequired: true });
  });

  it("fails closed for thrown, empty, and malformed transport responses without retrying", async () => {
    const thrownRpc = vi.fn().mockRejectedValue(new Error("network interrupted"));
    const thrown = await new SupabaseOperationalCommandRepository({ schema: () => ({ rpc: thrownRpc }) } as never).repairCorrectionPhysicalOccurrence({ commandId: "cmd-6", idempotencyKey: "idem-6", deurId: "deur-1", expectedVersion: 4 });
    expect(thrown).toMatchObject({ success: false, code: "TRANSPORT_FAILURE", retryable: true, refreshRequired: true });
    expect(thrownRpc).toHaveBeenCalledTimes(1);

    const malformedRpc = vi.fn().mockResolvedValue({ data: { accepted: true }, error: null });
    const malformed = await new SupabaseOperationalCommandRepository({ schema: () => ({ rpc: malformedRpc }) } as never).repairCorrectionPhysicalOccurrence({ commandId: "cmd-7", idempotencyKey: "idem-7", deurId: "deur-1", expectedVersion: 4 });
    expect(malformed).toMatchObject({ success: false, code: "VALIDATION_REJECTED", refreshRequired: true });
    expect(malformedRpc).toHaveBeenCalledTimes(1);
  });
});
