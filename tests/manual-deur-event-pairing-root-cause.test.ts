import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Event = {
  activityType: string;
  action: string;
  occurredAt: string;
  sequence: number;
};

const recalculateSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260729002200_phase_c4c_deur_completeness.sql"),
  "utf8",
);
const manualCreationSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260927000100_canonical_manual_deur_create_foundation.sql"),
  "utf8",
);
const cloneSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260928000800_rebuild_manual_deur_correction_source_alias.sql"),
  "utf8",
);
const bootstrapSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260927000400_preserve_manual_deur_bootstrap_history.sql"),
  "utf8",
);
const physicalTimelineSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260928000300_manual_deur_bootstrap_shift_marker_exclusion.sql"),
  "utf8",
);
const pairingDiagnosticSql = readFileSync(
  resolve(process.cwd(), "supabase/diagnostics/20260929000500_manual_deur_event_pairing_diagnostic.sql"),
  "utf8",
);
const remediationSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260929000600_manual_deur_bootstrap_classifier_fix.sql"),
  "utf8",
);
const occurrenceFixSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260930000100_manual_deur_correction_preserve_physical_occurrence.sql"),
  "utf8",
);

const sourceCreatedAt = "2026-09-28T05:35:00.810216Z";
const sourceEvents: Event[] = [
  { activityType: "shift", action: "start", occurredAt: sourceCreatedAt, sequence: 1 },
  { activityType: "operation", action: "start", occurredAt: sourceCreatedAt, sequence: 2 },
  { activityType: "operation", action: "end", occurredAt: "2026-09-28T05:36:00Z", sequence: 3 },
  { activityType: "shift", action: "end", occurredAt: "2026-09-28T05:36:00Z", sequence: 4 },
];

function isBootstrap(candidate: Event, targetCreatedAt: string): boolean {
  return (
    candidate.action === "start" &&
    (candidate.activityType === "shift" || candidate.activityType === "operation") &&
    candidate.occurredAt === targetCreatedAt
  );
}

function isCorrectedBootstrap(candidate: Event, targetCreatedAt: string): boolean {
  return (
    candidate.activityType === "shift" &&
    candidate.action === "start" &&
    candidate.sequence === 1 &&
    candidate.occurredAt === targetCreatedAt
  );
}

function operationMinutes(events: Event[]): number {
  const operation = events.filter((event) => event.activityType === "operation").sort((a, b) => a.sequence - b.sequence);
  let total = 0;
  for (let index = 0; index < operation.length; index += 1) {
    const start = operation[index];
    const end = operation[index + 1];
    if (start.action === "start" && end?.action === "end") {
      total += (Date.parse(end.occurredAt) - Date.parse(start.occurredAt)) / 60_000;
    }
  }
  // PostgreSQL numeric::integer rounds to the nearest integer rather than
  // truncating the fractional minute.
  return Math.round(total);
}

describe("manual DEUR event pairing root cause", () => {
  it("reproduces the deployed bootstrap predicate and clone mapping", () => {
    expect(isBootstrap(sourceEvents[0], sourceCreatedAt)).toBe(true);
    expect(isBootstrap(sourceEvents[1], sourceCreatedAt)).toBe(true);
    expect(isBootstrap(sourceEvents[2], sourceCreatedAt)).toBe(false);
    expect(isBootstrap(sourceEvents[3], sourceCreatedAt)).toBe(false);

    const replacementCreatedAt = "2026-09-28T17:48:00Z";
    const cloned = sourceEvents.map((event) => ({
      ...event,
      occurredAt: isBootstrap(event, sourceCreatedAt) ? replacementCreatedAt : event.occurredAt,
    }));

    expect(cloned[1].occurredAt).toBe(replacementCreatedAt);
    expect(cloned[2].occurredAt).toBe("2026-09-28T05:36:00Z");
    expect(operationMinutes(cloned)).toBe(-732);
  });

  it("proves the physical one-minute timeline when operation start is preserved", () => {
    const correctedClone = sourceEvents.map((event) => ({ ...event }));
    expect(operationMinutes(correctedClone)).toBe(1);
  });

  it("classifies only the first shift/start marker as bootstrap", () => {
    expect(isCorrectedBootstrap(sourceEvents[0], sourceCreatedAt)).toBe(true);
    expect(isCorrectedBootstrap(sourceEvents[1], sourceCreatedAt)).toBe(false);

    const correctedClone = sourceEvents.map((event) => ({
      ...event,
      occurredAt: isCorrectedBootstrap(event, sourceCreatedAt)
        ? "2026-09-28T17:48:00Z"
        : event.occurredAt,
    }));

    expect(correctedClone[0].occurredAt).toBe("2026-09-28T17:48:00Z");
    expect(correctedClone[1].occurredAt).toBe(sourceCreatedAt);
    expect(operationMinutes(correctedClone)).toBe(1);
  });

  it("pairs by activity type and sequence, including same-boundary and multiple intervals", () => {
    expect(operationMinutes([
      { activityType: "operation", action: "start", occurredAt: "2026-09-28T05:35:00Z", sequence: 2 },
      { activityType: "operation", action: "end", occurredAt: "2026-09-28T05:35:00Z", sequence: 3 },
    ])).toBe(0);
    expect(operationMinutes([
      { activityType: "operation", action: "start", occurredAt: "2026-09-28T05:35:00Z", sequence: 2 },
      { activityType: "operation", action: "end", occurredAt: "2026-09-28T05:36:00Z", sequence: 3 },
      { activityType: "operation", action: "start", occurredAt: "2026-09-28T06:00:00Z", sequence: 5 },
      { activityType: "operation", action: "end", occurredAt: "2026-09-28T06:30:00Z", sequence: 6 },
    ])).toBe(31);
  });

  it("documents the exact deployed SQL mechanics and preserves the negative diagnostic", () => {
    expect(bootstrapSql).toContain("candidate.occurred_at=target.created_at");
    expect(cloneSql).toContain("CASE WHEN erp.is_manual_deur_encoding_bootstrap_event(source_deur,e) THEN revision.created_at ELSE e.occurred_at END");
    expect(recalculateSql).toContain("lead(occurred_at) OVER (PARTITION BY activity_type ORDER BY sequence)");
    expect(recalculateSql).toContain("extract(epoch FROM (ended_at-occurred_at))/60");
    expect(recalculateSql).toContain("::integer");
    expect(Date.parse("2026-09-28T05:36:00Z") - Date.parse("2026-09-28T17:48:00Z")).toBe(-732 * 60_000);
  });

  it("preserves physical occurrence time while retaining correction bootstrap provenance", () => {
    expect(occurrenceFixSql).toContain("occurrence_marker");
    expect(occurrenceFixSql).toContain("definition := replace(definition, occurrence_marker, 'e.occurred_at')");
    expect(occurrenceFixSql).toContain("definition := replace(definition, server_marker, 'now_at')");
    expect(occurrenceFixSql).toContain("occurrence_marker text := 'CASE WHEN erp.is_manual_deur_encoding_bootstrap_event(source_deur,e) THEN revision.created_at ELSE e.occurred_at END'");
    expect(occurrenceFixSql).toContain("server_marker text := 'CASE WHEN erp.is_manual_deur_encoding_bootstrap_event(source_deur,e) THEN revision.created_at ELSE now_at END'");

    const replacementCreatedAt = "2026-09-29T02:33:58Z";
    const correctedClone = sourceEvents.map((event) => ({
      ...event,
      occurredAt: event.occurredAt,
    }));
    expect(correctedClone[0].occurredAt).toBe(sourceCreatedAt);
    expect(correctedClone[1].occurredAt).toBe(sourceCreatedAt);
    expect(correctedClone[2].occurredAt).toBe("2026-09-28T05:36:00Z");
    expect(correctedClone[3].occurredAt).toBe("2026-09-28T05:36:00Z");
    expect(replacementCreatedAt).not.toBe(correctedClone[0].occurredAt);
    expect(operationMinutes(correctedClone)).toBe(1);
  });

  it("leaves initial manual bootstrap creation semantics unchanged", () => {
    expect(manualCreationSql).toContain("'shift','start',now_at,1");
    expect(manualCreationSql).toContain("'operation','start',now_at,2");
    expect(occurrenceFixSql).not.toContain("command_create_manual_deur");
  });

  it("keeps the physical overlap guard and correction side effects bounded", () => {
    expect(physicalTimelineSql).toContain("RETURN 'PHYSICAL_ACTIVITY_OVERLAP'");
    expect(occurrenceFixSql).not.toContain("customer_review_requests");
    expect(occurrenceFixSql).not.toContain("audit_log");
    expect(occurrenceFixSql).not.toContain("billing");
  });

  it("keeps the existing corrected revision repair boundary explicit", () => {
    expect(occurrenceFixSql).toContain("p.proname = 'command_create_deur_correction'");
    expect(occurrenceFixSql).not.toMatch(/UPDATE\s+erp\.deur_events/i);
    expect(occurrenceFixSql).not.toMatch(/DELETE\s+FROM\s+erp\.deur_events/i);
    expect(occurrenceFixSql).not.toMatch(/INSERT\s+INTO\s+erp\.deurs/i);
    expect(occurrenceFixSql).not.toContain("DISABLE TRIGGER");
  });

  it("prepares a single aborting pairing diagnostic without changing normal totals", () => {
    expect(pairingDiagnosticSql).toContain("ERRCODE='PZ003'");
    expect(pairingDiagnosticSql).toContain("CORRECTION_EVENT_PAIRING_DIAGNOSTIC");
    expect(pairingDiagnosticSql).toContain("'operationPairs',operation_pairs");
    expect(pairingDiagnosticSql).toContain("'durationSeconds'");
    expect(pairingDiagnosticSql).toContain("'startTimezoneOffsetSeconds'");
    expect(pairingDiagnosticSql).toContain("WHEN SQLSTATE ''PZ003'' THEN");
    expect(pairingDiagnosticSql).toContain("RETURN QUERY");
    expect(pairingDiagnosticSql).not.toContain("UPDATE erp.deurs");
    expect(pairingDiagnosticSql).not.toContain("INSERT INTO erp.deurs");
  });

  it("defines the forward-only classifier fix and removes only the temporary totals diagnostic", () => {
    expect(remediationSql).toContain("candidate.activity_type='shift'");
    expect(remediationSql).toContain("candidate.sequence=1");
    expect(remediationSql).not.toContain("candidate.activity_type IN ('shift','operation')");
    expect(remediationSql).toContain("CREATE OR REPLACE FUNCTION erp.refresh_deur_totals_after_shift_end()");
    expect(remediationSql).toContain("erp.recalculate_deur_event_totals(NEW.deur_id)");
    expect(remediationSql).toContain("temporary correction event-total diagnostic handler is missing");
    expect(remediationSql).toContain("CORRECTION_EVENT_TOTALS_DIAGNOSTIC");
    expect(remediationSql).toContain("E'  EXCEPTION WHEN SQLSTATE ''PZ001'' THEN'");
  });
});
