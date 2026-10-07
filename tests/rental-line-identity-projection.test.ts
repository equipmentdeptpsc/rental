import { describe, expect, it } from "vitest";

import { mapRentalEquipmentLine } from "@/integrations/supabase/readRepositories";
import { toRentalEquipmentLineReturnTarget } from "@/features/rental/equipment-line";

const rentalId = "fe225d54-5aec-42ab-b1e1-9ae731409e56";
const lineId = "a012baad-3b15-4aa0-a1c9-37c73f90a480";
const equipmentId = "f9c0f0b5-9da1-4ad3-b9d6-db144844d190";
const assignmentId = "dcfd253c-bb1d-4d7f-b4bb-2af61212a600";

describe("canonical rental-line identity projection", () => {
  it("preserves line, equipment, and assignment IDs from the canonical row", () => {
    const mapped = mapRentalEquipmentLine({
      id: lineId,
      rental_id: rentalId,
      equipment_id: equipmentId,
      assignment_id: assignmentId,
      operator_id: "operator-1",
      status: "Active",
      row_version: 9,
      created_at: "2026-09-30T00:00:00.000Z",
      updated_at: "2026-10-04T00:00:00.000Z",
    });

    expect(mapped.success).toBe(true);
    if (!mapped.success) return;

    expect(mapped.value.id).toBe(lineId);
    expect(mapped.value.equipmentId).toBe(equipmentId);
    expect(mapped.value.assignmentId).toBe(assignmentId);
    expect(toRentalEquipmentLineReturnTarget(mapped.value)).toEqual({
      rentalLineId: lineId,
      equipmentId,
      assignmentId,
      rowVersion: 9,
    });
    expect(toRentalEquipmentLineReturnTarget(mapped.value).rentalLineId).not.toBe(equipmentId);
  });

  it("keeps identities distinct across multiple equipment lines", () => {
    const lines = [lineId, "line-2"].map((id, index) => ({
      id,
      rentalId,
      equipmentId: index === 0 ? equipmentId : "equipment-2",
      assignmentId: index === 0 ? assignmentId : "assignment-2",
      operatorId: `operator-${index + 1}`,
      status: "Active" as const,
      rowVersion: index + 9,
      createdAt: "",
      updatedAt: "",
    }));

    expect(lines.map(toRentalEquipmentLineReturnTarget)).toEqual([
      { rentalLineId: lineId, equipmentId, assignmentId, rowVersion: 9 },
      { rentalLineId: "line-2", equipmentId: "equipment-2", assignmentId: "assignment-2", rowVersion: 10 },
    ]);
  });
});
