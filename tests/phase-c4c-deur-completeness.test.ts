import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyDigitalDeurOperatorAction } from "@/features/rental/deur/operator/applyDigitalDeurOperatorAction";
import { BillingRateEngine } from "@/features/rental/billing/engine/BillingRateEngine";
import type { DeurRecord } from "@/features/rental/deur/types";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260729002200_phase_c4c_deur_completeness.sql"),
  "utf8",
);
const correctionOrderSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260729002300_phase_c4c_correction_order_fix.sql"),
  "utf8",
);

const base = (): DeurRecord => ({
  id: "deur-c4c", rentalId: "rental-c4c", rentalEquipmentLineId: "line-c4c",
  equipmentId: "equipment-c4c", operatorId: "operator-c4c", workDate: "2026-07-29",
  creationSource: "OPERATOR_DIGITAL", evidenceMode: "TIME_TIMELINE", logs: [],
  events: [], totalOperatingMinutes: 0, totalIdleMinutes: 0, totalStandbyMinutes: 0,
  totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0,
  totalDemobilizationMinutes: 0, status: "Draft", billingLocked: false,
  createdAt: "2026-07-29T15:50:00.000Z", updatedAt: "2026-07-29T15:50:00.000Z",
});

describe("Phase C4C DEUR completeness", () => {
  it("keeps the deterministic clock owner-only and transaction-local", () => {
    expect(sql).toContain("session_user=database_owner");
    expect(sql).toContain("current_setting('erp.c4c_test_clock',true)");
    expect(sql).toContain("REVOKE ALL ON FUNCTION deur_operational_clock() FROM PUBLIC,anon,authenticated,service_role");
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION deur_operational_clock/);
  });

  it("adds canonical standby without reinterpreting idle", () => {
    expect(sql).toContain("'standby'");
    expect(sql).toContain("total_standby_minutes");
    expect(sql).toContain("source.total_standby_minutes::numeric/60");
    expect(sql).not.toContain("source.total_idle_minutes::numeric/60)*coalesce(terms.standby_rate");
  });

  it("uses an allowlisted correction patch and recalculates derived totals", () => {
    expect(sql).toContain("command_apply_deur_correction(command jsonb)");
    expect(sql).toContain("ARRAY['events','openingMeter','closingMeter','projectId','reason']");
    expect(sql).toContain("recalculate_deur_event_totals(target.id)");
    expect(sql).toContain("REVOKE ALL ON FUNCTION command_apply_deur_correction(jsonb) FROM PUBLIC,anon,service_role");
  });

  it("retires the source before inserting its correction revision", () => {
    expect(correctionOrderSql.indexOf("UPDATE deurs SET superseded_by_revision_id=revision.id"))
      .toBeLessThan(correctionOrderSql.indexOf("INSERT INTO deurs SELECT revision.*"));
    expect(correctionOrderSql).toContain("nullif(btrim(command->>'reasonDetails'),'') IS NULL");
  });

  it("projects an overnight standby interval separately", () => {
    let record = base();
    for (const [action, timestamp] of [
      ["START_OPERATION", "2026-07-29T15:50:00.000Z"],
      ["START_STANDBY", "2026-07-29T16:00:00.000Z"],
      ["START_OPERATION", "2026-07-30T00:30:00.000Z"],
      ["END_SHIFT", "2026-07-30T01:00:00.000Z"],
    ] as const) {
      const result = applyDigitalDeurOperatorAction({
        deur: record, action, actionTimestamp: timestamp, actor: { id: "actor", name: "Operator" },
        meterRequirement: "none", idFactory: (() => { let n = 0; return () => `event-${action}-${++n}`; })(),
      });
      expect(result.success).toBe(true);
      if (result.success) record = result.record;
    }
    expect(record.totalOperatingMinutes).toBe(40);
    expect(record.totalStandbyMinutes).toBe(510);
    expect(record.totalIdleMinutes).toBe(0);
    expect(BillingRateEngine.calculate(record, {
      billingMethod: "Per Hour", unitRate: 100, standbyRate: 20, operatorIncluded: true,
    }).standbyCharge).toBe(170);
  });

  it("rejects a duplicate transition to standby", () => {
    const started = applyDigitalDeurOperatorAction({
      deur: base(), action: "START_STANDBY", actionTimestamp: "2026-07-29T16:00:00.000Z",
      actor: { name: "Operator" }, meterRequirement: "none",
    });
    expect(started.success).toBe(true);
    if (!started.success) return;
    const duplicate = applyDigitalDeurOperatorAction({
      deur: started.record, action: "START_STANDBY", actionTimestamp: "2026-07-29T16:01:00.000Z",
      actor: { name: "Operator" }, meterRequirement: "none",
    });
    expect(duplicate.success).toBe(false);
  });
});
