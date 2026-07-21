import { describe, expect, it } from "vitest";
import { buildTimeline } from "@/features/rental/workspace/timeline/TimelineBuilder";
import type { RentalAggregate } from "@/features/rental/aggregate";

function aggregate(overrides: Record<string, unknown> = {}): RentalAggregate {
  return {
    rentalEquipmentLines: [],
    rental: {
      id: "rental-1", equipmentId: "equipment-1", customer: "Customer", project: "Project", rentedBy: "",
      dateOut: "2026-01-01", expectedReturn: "2026-01-31", statusId: "", status: "Closed",
      createdAt: "2026-01-01T08:00:00.000Z", reservedAt: "2026-01-01T09:00:00.000Z",
      releasedAt: "2026-01-02T08:00:00.000Z", activatedAt: "2026-01-02T09:00:00.000Z",
      returnedAt: "2026-01-05T08:00:00.000Z", closedAt: "2026-01-05T09:00:00.000Z",
      ...overrides,
    },
    deurs: [],
    billing: { totalOperatingCharge: 0, totalIdleCharge: 0, totalMobilizationCharge: 0, totalDemobilizationCharge: 0, totalAdjustment: 0, subtotal: 0, invoiced: 0, collected: 0, outstanding: 0 },
  };
}

describe("rental workspace transaction timeline", () => {
  it("excludes Expected Return and shows recorded rental transactions chronologically", () => {
    const source = aggregate();
    const before = structuredClone(source);
    const timeline = buildTimeline(source);

    expect(timeline.map((event) => event.title)).toEqual(["Rental Created", "Reserved", "Released", "Activated", "Returned", "Closed"]);
    expect(timeline.some((event) => event.title === "Expected Return")).toBe(false);
    expect(timeline.every((event) => event.completed)).toBe(true);
    expect(source).toEqual(before);
  });

  it("uses only recorded timestamps and does not create artificial lifecycle milestones", () => {
    const timeline = buildTimeline(aggregate({ createdAt: undefined, reservedAt: undefined, releasedAt: undefined, activatedAt: undefined, returnedAt: undefined, closedAt: undefined, actualReturn: undefined }));
    expect(timeline).toEqual([]);
  });

  it("uses recorded return and close dates when available, including legacy actual return", () => {
    const timeline = buildTimeline(aggregate({ createdAt: undefined, reservedAt: undefined, releasedAt: undefined, activatedAt: undefined, returnedAt: undefined, actualReturn: "2026-01-05", closedAt: "2026-01-06T08:00:00.000Z" }));
    expect(timeline.map((event) => event.title)).toEqual(["Returned", "Closed"]);
  });

  it("shows cancellation only when its transaction timestamp was recorded", () => {
    expect(buildTimeline(aggregate({ createdAt: undefined, reservedAt: undefined, releasedAt: undefined, activatedAt: undefined, returnedAt: undefined, closedAt: undefined, actualReturn: undefined, cancelledAt: "2026-01-03T08:00:00.000Z" })).map((event) => event.title)).toEqual(["Cancelled"]);
  });
});
