import { describe, expect, it } from "vitest";
import { calculateFleetUtilization } from "@/features/dashboard/services/fleetUtilization";
import type { EquipmentRecord } from "@/features/equipment/types";

const item = (id: string, status: EquipmentRecord["status"], extra: Partial<EquipmentRecord> = {}): EquipmentRecord => ({ id, prefixId: "ME", assetNo: id, equipmentName: id, category: "Moving Equipment", status, maintenanceType: "Engine Hours", currentReading: 0, projectId: "", operatorId: "", ...extra });

describe("Phase 2D fleet utilization", () => {
  it("counts four deployed active records as fully utilized", () => expect(calculateFleetUtilization([1,2,3,4].map((n) => item(String(n), "Rented")))).toMatchObject({ total: 4, deployed: 4, utilized: 4, rate: 100 }));
  it("counts two deployed records in a four-record active fleet as half utilized", () => expect(calculateFleetUtilization([item("1","Rented"),item("2","Rented"),item("3","Available"),item("4","Available")])).toMatchObject({ total:4,deployed:2,utilized:2,rate:50 }));
  it("counts mixed Assigned and Deployed states without counting Available or Maintenance", () => expect(calculateFleetUtilization([item("1", "Assigned"), item("2", "Rented"), item("3", "Available"), item("4", "Maintenance")])).toMatchObject({ assigned: 1, deployed: 1, available: 1, maintenance: 1, utilized: 2, rate: 50 }));
  it("excludes inactive, deleted, and duplicate references outside the equipment catalog", () => expect(calculateFleetUtilization([item("1", "Rented"), item("2", "Assigned", { active: false }), item("3", "Rented", { deleted: true })])).toMatchObject({ total: 1, utilized: 1, rate: 100 }));
  it("handles an empty eligible fleet", () => expect(calculateFleetUtilization([])).toMatchObject({ total: 0, utilized: 0, rate: 0 }));
});
