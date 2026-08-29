import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("UAT provisioning attempt lifecycle", () => {
  it("opens a durable attempt before work and closes it on success/failure", () => {
    const worker = readFileSync("worker/uatMultiEquipmentProvisioner.ts", "utf8");
    const migration = readFileSync("supabase/migrations/20260830000100_uat_provisioning_attempt_lifecycle.sql", "utf8");
    expect(worker.indexOf("begin_isolated_uat_provisioning_attempt")).toBeGreaterThan(-1);
    expect(worker.indexOf("begin_isolated_uat_provisioning_attempt")).toBeLessThan(worker.indexOf("claim_isolated_uat_multi_equipment_provisioning"));
    expect(worker).toContain("finish_isolated_uat_provisioning_attempt");
    expect(migration).toContain("state='RUNNING'");
    expect(migration).toContain("next_state NOT IN ('COMPLETED','FAILED')");
    expect(migration).toContain("UAT_EXECUTION_ALREADY_ACTIVE");
  });
  it("terminalizes structured reference validation failures", () => {
    const worker = readFileSync("worker/uatMultiEquipmentProvisioner.ts", "utf8");
    const start = worker.indexOf("if(!draft.costCodeId||!draft.activityCodeId)");
    const end = worker.indexOf("await rpc(service,\"update_isolated_uat_multi_equipment_references\"", start);
    const branch = worker.slice(start, end);
    expect(branch).toContain("finish_isolated_uat_provisioning_attempt");
    expect(branch).toContain('state:"FAILED"');
    expect(branch).toContain("UAT_REFERENCE_UNAVAILABLE");
  });
});
