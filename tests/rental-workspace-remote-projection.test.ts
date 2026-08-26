import { describe, expect, it } from "vitest";

import { resolveRentalBillingBlockers } from "@/features/rental/billing/resolveRentalBillingBlockers";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import { resolveRentalWorkspaceDeurs } from "@/features/rental/workspace/resolveRentalWorkspaceDeurs";
import { mapDeur } from "@/integrations/supabase/readRepositories";

const rentalId = "rental-1";
const line = {
  id: "line-1",
  rentalId,
  equipmentId: "equipment-1",
  operatorId: "operator-1",
  status: "Active",
  commercialSnapshot: { billingMethod: "Per Hour", currency: "PHP", unitRate: 1000 },
} as RentalEquipmentLine;

describe("remote Rental workspace projection", () => {
  it("uses the authenticated canonical DEUR result instead of the local compatibility repository", () => {
    const mapped = mapDeur({
      id: "deur-1",
      rental_id: rentalId,
      rental_equipment_line_id: line.id,
      equipment_id: line.equipmentId,
      status: "Acknowledged",
      deur_number: "DEUR-2026-000001",
      row_version: 9,
      deur_events: [{ id: "event-1", deur_id: "deur-1", activity_type: "Operation", action: "START", occurred_at: "2026-08-26T00:00:00Z", sequence: 1 }],
    });
    expect(mapped.success).toBe(true);
    if (!mapped.success) return;

    const records = resolveRentalWorkspaceDeurs({ rentalId, remote: true, remoteDeurs: [mapped.value], localDeurs: [] });
    expect(records).toMatchObject([{ id: "deur-1", status: "Acknowledged", rowVersion: 9, events: [{ id: "event-1", sequence: 1 }] }]);
  });

  it("does not fall back to local DEURs in remote mode", () => {
    const local = { id: "local-deur", rentalId, status: "Draft" } as DeurRecord;
    expect(resolveRentalWorkspaceDeurs({ rentalId, remote: true, remoteDeurs: [], localDeurs: [local] })).toEqual([]);
    expect(resolveRentalWorkspaceDeurs({ rentalId, remote: false, remoteDeurs: [], localDeurs: [local] })).toEqual([local]);
  });

  it("resolves billing readiness with canonical equipment and acknowledged DEUR evidence", () => {
    const deur = { id: "deur-1", rentalId, rentalEquipmentLineId: line.id, equipmentId: line.equipmentId, status: "Acknowledged" } as DeurRecord;
    const equipment = [{ id: "equipment-1", assetNo: "UAT-EQP-003", equipmentName: "UAT Equipment 003" }] as never;
    expect(resolveRentalBillingBlockers({ lines: [line], deurs: [deur], equipment })).toEqual([]);
  });
});
