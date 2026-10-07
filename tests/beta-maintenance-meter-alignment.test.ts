import { describe, expect, it, vi } from "vitest";
import { BETA_MAINTENANCE_TYPES, meterRequirementForMaintenanceType, normalizeMaintenanceType } from "@/features/equipment/services/maintenanceMeterPolicy";
import { getDeurMeterRequirement } from "@/features/rental/deur/services/getDeurMeterRequirement";
import { operatorMeterPresentation } from "@/features/rental/deur/operator/operatorMeterPresentation";
import { calculateShiftHourMeterSeconds } from "@/features/rental/deur/services/calculateShiftHourMeter";
import { deurShiftDistanceKilometers } from "@/features/rental/deur/services/canonicalMeterEvidence";
import { readFileSync } from "node:fs";
import { SupabaseEquipmentCommandRepository } from "@/integrations/supabase/SupabaseEquipmentCommandRepository";
import type { CanonicalDeurEvent, DeurActivityTypeCanonical } from "@/features/rental/deur/types";

const event = (sequence: number, activityType: DeurActivityTypeCanonical, action: "start" | "end", time: string): CanonicalDeurEvent => ({
  id: String(sequence), sequence, activityType, action, timestamp: `2026-10-06T${time}:00Z`, source: "user",
});

describe("beta Maintenance Type meter policy", () => {
  it.each([
    ["Hour Meter", "hourMeter"], ["Mileage", "odometer"], ["Both", "both"], ["None", "none"],
    ["Engine Hours", "hourMeter"], ["Kilometers", "odometer"], ["Calendar Days", "none"],
  ] as const)("maps %s to %s", (maintenanceType, kind) => {
    expect(meterRequirementForMaintenanceType(maintenanceType)).toBe(kind);
    expect(getDeurMeterRequirement({ maintenanceType, billingMethod: "Per Day" }).kind).toBe(kind);
  });

  it("offers only the four beta choices while normalizing historical edits", () => {
    expect(BETA_MAINTENANCE_TYPES).toEqual(["Hour Meter", "Mileage", "None", "Both"]);
    expect(normalizeMaintenanceType("Engine Hours")).toBe("Hour Meter");
    expect(normalizeMaintenanceType("Kilometers")).toBe("Mileage");
    expect(normalizeMaintenanceType("Calendar Days")).toBe("None");
  });

  it("retains the frozen snapshot after Equipment Maintenance Type changes", () => {
    expect(getDeurMeterRequirement({ frozenMeterRequirement: "odometer", maintenanceType: "None" })).toMatchObject({ kind: "odometer", source: "frozen-snapshot" });
  });

  it("derives shift distance from persisted odometer checkpoints", () => {
    expect(deurShiftDistanceKilometers({ meterRequirement: "both", openingOdometer: 120, closingOdometer: 146.5 })).toBe(26.5);
    expect(deurShiftDistanceKilometers({ meterRequirement: "none" })).toBeUndefined();
  });

  it("extends only the canonical create allowlist in the forward migration", () => {
    const sql = readFileSync("supabase/migrations/20261006000100_beta_maintenance_type_meter_alignment.sql", "utf8");
    expect(sql).toContain("maintenance_type_value NOT IN('Hour Meter','Mileage','None','Both'");
    expect(sql).toContain("WHEN 'Calendar Days' THEN 'none'");
    expect(sql).toContain("UPDATE erp.equipment SET maintenance_type=desired");
    expect(sql).toContain("target.row_version<>(command->>'expectedVersion')::bigint");
    expect(sql).toContain("erp.command_update_equipment_maintenance_type");
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
  });

  it.each([
    ["hourMeter", true, false], ["odometer", false, true], ["both", true, true], ["none", false, false],
  ] as const)("shows the correct operator controls for %s", (kind, hours, odometer) => {
    expect(operatorMeterPresentation(kind)).toEqual({ showAutomaticHourMeter: hours, showOdometerCheckpoint: odometer });
  });

  it("sends only the scoped Maintenance Type update command", async () => {
    const rpc = vi.fn(async () => ({ data: { success: true, disposition: "ACCEPTED", serverOccurredAt: "2026-10-06T00:00:00Z", refresh: ["equipment-1"], value: { id: "equipment-1", maintenanceType: "Both", rowVersion: 3 } }, error: null }));
    const repository = new SupabaseEquipmentCommandRepository({ schema: () => ({ rpc }) });
    const command = { commandId: "command-1", idempotencyKey: "idem-1", equipmentId: "equipment-1", expectedVersion: 2, maintenanceType: "Both" as const };
    expect(await repository.updateMaintenanceType(command)).toMatchObject({ success: true, value: { maintenanceType: "Both", rowVersion: 3 } });
    expect(rpc).toHaveBeenCalledWith("command_update_equipment_maintenance_type", { command });
  });
});

describe("automatic shift Hour Meter", () => {
  it("counts Operating and Idle while excluding Stand-by and Meal Break", () => {
    const events = [
      event(1, "shift", "start", "08:00"), event(2, "operation", "start", "08:00"), event(3, "operation", "end", "09:00"),
      event(4, "idle", "start", "09:00"), event(5, "idle", "end", "09:30"),
      event(6, "standby", "start", "09:30"), event(7, "standby", "end", "10:00"),
      event(8, "mealBreak", "start", "10:00"), event(9, "mealBreak", "end", "10:30"),
      event(10, "operation", "start", "10:30"), event(11, "operation", "end", "11:00"), event(12, "shift", "end", "11:00"),
    ];
    expect(calculateShiftHourMeterSeconds(events, "2026-10-06T12:00:00Z")).toBe(7200);
  });

  it("projects a running interval from timestamps and stops at End Shift", () => {
    const running = [event(1, "shift", "start", "08:00"), event(2, "operation", "start", "08:00")];
    expect(calculateShiftHourMeterSeconds(running, "2026-10-06T08:45:00Z")).toBe(2700);
    expect(calculateShiftHourMeterSeconds([...running, event(3, "shift", "end", "09:00")], "2026-10-06T12:00:00Z")).toBe(3600);
  });

  it("unions overlapping Operating and Idle intervals without double counting", () => {
    const overlapping = [
      event(1, "shift", "start", "08:00"), event(2, "operation", "start", "08:00"),
      event(3, "idle", "start", "08:30"), event(4, "operation", "end", "09:00"), event(5, "idle", "end", "09:30"),
    ];
    expect(calculateShiftHourMeterSeconds(overlapping, "2026-10-06T10:00:00Z")).toBe(5400);
  });
});

describe("maintenance type command migration safety", () => {
  const sql = readFileSync("supabase/migrations/20261006000100_beta_maintenance_type_meter_alignment.sql", "utf8");
  const helper = readFileSync("supabase/migrations/20260729000400_phase_c2h_command_hardening.sql", "utf8");
  const command = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION erp.command_update_equipment_maintenance_type"));

  it("checks permission, tenant, deletion, and active state before beginning a command", () => {
    const permission = command.indexOf("erp.current_user_has_permission('equipment.update')");
    const target = command.indexOf("SELECT * INTO target FROM erp.equipment");
    const begin = command.indexOf("idem:=erp.begin_operational_command");
    expect(permission).toBeGreaterThanOrEqual(0);
    expect(target).toBeGreaterThan(permission);
    expect(begin).toBeGreaterThan(target);
    expect(command).toContain("company_id=tenant AND deleted_at IS NULL AND active=true FOR UPDATE");
    expect(command).toContain("IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND')");
  });

  it("rejects unsupported types and audits only a successful update", () => {
    expect(command).toContain("desired NOT IN('Hour Meter','Mileage','None','Both')");
    const update = command.indexOf("UPDATE erp.equipment SET maintenance_type=desired");
    const audit = command.indexOf("'EQUIPMENT_MAINTENANCE_TYPE_UPDATED'");
    const finish = command.indexOf("RETURN erp.finish_operational_command");
    expect(update).toBeGreaterThanOrEqual(0);
    expect(audit).toBeGreaterThan(update);
    expect(finish).toBeGreaterThan(audit);
  });

  it("replays first, then returns a refreshable stale-version conflict without poisoning a retry", () => {
    const begin = command.indexOf("idem:=erp.begin_operational_command");
    const replay = command.indexOf("idem->>'state'='REPLAY'");
    const newState = command.indexOf("idem->>'state'<>'NEW'");
    const conflict = command.indexOf("target.row_version<>(command->>'expectedVersion')::bigint");
    const update = command.indexOf("UPDATE erp.equipment SET maintenance_type=desired");
    const finish = command.indexOf("RETURN erp.finish_operational_command");
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(replay).toBeGreaterThan(begin);
    expect(newState).toBeGreaterThan(replay);
    expect(conflict).toBeGreaterThan(newState);
    expect(update).toBeGreaterThan(conflict);
    expect(finish).toBeGreaterThan(update);
    expect(command.slice(conflict, update)).toContain("'code','CONFLICT','refreshRequired',true,'currentVersion',target.row_version");
    const beginBody = helper.split("CREATE OR REPLACE FUNCTION begin_operational_command(")[1]?.split("CREATE OR REPLACE FUNCTION finish_operational_command(")[0] ?? "";
    expect(beginBody).toContain("IF existing.id IS NULL THEN RETURN jsonb_build_object('state','NEW','payloadHash',payload_hash)");
    expect(beginBody).not.toMatch(/INSERT INTO operational_command_idempotency/i);
    expect(helper.split("CREATE OR REPLACE FUNCTION finish_operational_command(")[1]).toMatch(/INSERT INTO operational_command_idempotency/i);
  });
});
