import { describe, expect, it } from "vitest";

import { evaluateRentalEquipmentLineDeurCompliance } from "@/features/rental/deur/compliance/evaluateRentalDeurCompliance";
import type { RentalRecord } from "@/features/rental/types";

const rental = { id: "rental-1", status: "Active", dateOut: "2026-10-01", deurExpectationPolicy: { frequency: "PER_WORKDAY", effectiveFrom: "2026-10-01", timezone: "Asia/Manila", capturedAt: "2026-10-01T00:00:00.000Z" } } as RentalRecord;
const line = (id: string, status: "Active" | "Returned", actualReturnDate?: string) => ({ id, rentalId: rental.id, equipmentId: `${id}-equipment`, operatorId: `${id}-operator`, status, actualReturnDate, createdAt: "", updatedAt: "" });

describe("line-scoped DEUR expectations after equipment return", () => {
  it("preserves the returned line's history through its business return date while active lines continue", () => {
    const results = evaluateRentalEquipmentLineDeurCompliance({ rental, lines: [line("returned", "Returned", "2026-10-03"), line("active", "Active")], deurs: [], evaluationTimestamp: "2026-10-05T00:00:00.000Z" });
    const returned = results.find((item) => item.rentalEquipmentLineId === "returned")!.result;
    const active = results.find((item) => item.rentalEquipmentLineId === "active")!.result;
    expect(returned.expectations.map((item) => item.workDate)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(active.expectations.map((item) => item.workDate)).toContain("2026-10-05");
  });
});
