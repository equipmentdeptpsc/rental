import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260929000400_manual_deur_event_totals_diagnostic.sql"),
  "utf8",
);
const recalculateSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260729002200_phase_c4c_deur_completeness.sql"),
  "utf8",
);

describe("manual DEUR event-total diagnostic migration", () => {
  it("instruments only correction-replacement shift/end events", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION erp.refresh_deur_totals_after_shift_end()");
    expect(sql).toContain("NEW.activity_type='shift' AND NEW.action='end'");
    expect(sql).toContain("target.previous_revision_id IS NOT NULL");
    expect(sql).toContain("target.creation_source='MANUAL_WEB'");
    expect(sql).toContain("target.correction_reason_code IS NOT NULL");
    expect(sql).toContain("'targetClassification','CORRECTION_REPLACEMENT'");
    expect(sql).toContain("'eventType',NEW.activity_type");
    expect(sql).toContain("'eventAction',NEW.action");
  });

  it("captures all seven final minute values with null and negative flags", () => {
    for (const field of ["operating", "idle", "standby", "maintenance", "mealBreak", "mobilization", "demobilization"]) {
      expect(sql).toContain(`'${field}',jsonb_build_object`);
    }
    expect(sql.match(/'isNull'/g)?.length).toBeGreaterThanOrEqual(7);
    expect(sql.match(/'isNegative'/g)?.length).toBeGreaterThanOrEqual(7);
    expect(sql).toContain("calculated.operation_minutes");
    expect(sql).toContain("calculated.breakdown_minutes");
    expect(sql).toContain("target.total_mobilization_minutes");
    expect(sql).toContain("target.total_demobilization_minutes");
  });

  it("aborts before the normal parent update and preserves normal refresh logic", () => {
    const raiseIndex = sql.indexOf("ERRCODE='PZ002'");
    const updateIndex = sql.indexOf("UPDATE erp.deurs SET");
    expect(raiseIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(raiseIndex);
    expect(sql).toContain("RETURN NULL;");
    expect(sql).toContain("total_operating_minutes=calculated.operation_minutes");
    expect(sql).toContain("total_maintenance_minutes=calculated.breakdown_minutes");
  });

  it("uses the safe structured transport contract", () => {
    expect(sql).toContain("ERRCODE='PZ002'");
    expect(sql).toContain("'code'',''CORRECTION_EVENT_TOTALS_DIAGNOSTIC''");
    expect(sql).toContain("'message'',''Correction event totals were captured before validation.''");
    expect(sql).toContain("'retryable'',false");
    expect(sql).toContain("'refreshRequired'',false");
    expect(sql).toContain("'details'',outer_detail::jsonb");
    expect(sql).toContain("WHEN SQLSTATE ''PZ001'' THEN");
  });

  it("models the deployed minute formulas for a one-minute operation and shared boundaries", () => {
    const start = Date.parse("2026-09-28T13:35:00Z");
    const end = Date.parse("2026-09-28T13:36:00Z");
    expect(Math.trunc((end - start) / 60000)).toBe(1);
    expect(Math.trunc((start - start) / 60000)).toBe(0);
    expect(recalculateSql).toContain("extract(epoch FROM (ended_at-occurred_at))/60");
    expect(recalculateSql).toContain("::integer");
    expect(recalculateSql).toContain("coalesce(max(minutes) FILTER(WHERE activity_type='operation'),0)");
  });

  it("does not add persistent diagnostic writes or touch correction business data", () => {
    expect(sql).not.toMatch(/INSERT\s+INTO\s+.*diagnos/i);
    expect(sql).not.toContain("customer_review_requests");
    expect(sql).not.toContain("billing_statement");
    expect(sql).not.toContain("provider");
    expect(sql).not.toContain("CREATE TRIGGER");
    expect(sql).not.toContain("UPDATE erp.deurs SET total_mobilization_minutes");
    expect(sql).not.toContain("UPDATE erp.deurs SET total_demobilization_minutes");
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
  });
});
