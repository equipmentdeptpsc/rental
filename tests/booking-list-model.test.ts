import { describe, expect, it } from "vitest";
import { bookingAttentionLabels, bookingDateRange, bookingMatchesKeyword, bookingOverlapsRange, bookingRangeError } from "@/features/booking/bookingListModel";
import type { CanonicalBookingListItem } from "@/features/booking/canonical";

const row = (dateOut: string, expectedReturn?: string): CanonicalBookingListItem => ({ rentalId: "rental-1", rentalEquipmentLineId: "line-1", equipmentId: "equipment-1", rentalNumber: "RB-204", rentalStatus: "Reserved", customerName: "North Harbor", projectName: "Pier Works", equipmentAssetNumber: "EX-12", equipmentName: "Excavator", dateOut, expectedReturn, createdAt: "2026-10-01T01:00:00Z" });

describe("booking list date and search model", () => {
  it("uses inclusive overlap for each boundary and spanning interval", () => {
    const range = { from: "2026-10-08", to: "2026-10-14" };
    expect(bookingOverlapsRange(row("2026-10-09", "2026-10-11"), range.from, range.to)).toBe(true);
    expect(bookingOverlapsRange(row("2026-10-01", "2026-10-08"), range.from, range.to)).toBe(true);
    expect(bookingOverlapsRange(row("2026-10-14", "2026-10-20"), range.from, range.to)).toBe(true);
    expect(bookingOverlapsRange(row("2026-09-01", "2026-11-01"), range.from, range.to)).toBe(true);
    expect(bookingOverlapsRange(row("2026-10-01", "2026-10-07"), range.from, range.to)).toBe(false);
    expect(bookingOverlapsRange(row("2026-10-15", "2026-10-20"), range.from, range.to)).toBe(false);
    expect(bookingOverlapsRange(row("2026-10-01"), "2027-01-01", "2027-01-02")).toBe(true);
  });

  it("resolves quick date presets and rejects invalid or oversized ranges", () => {
    expect(bookingDateRange("today", "2026-10-08")).toEqual({ from: "2026-10-08", to: "2026-10-08" });
    expect(bookingDateRange("week", "2026-10-08")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(bookingDateRange("next7", "2026-10-08")).toEqual({ from: "2026-10-08", to: "2026-10-14" });
    expect(bookingDateRange("month", "2026-10-08")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(bookingDateRange("custom", "2026-10-08", "2026-09-20", "2026-10-20")).toEqual({ from: "2026-09-20", to: "2026-10-20" });
    expect(bookingRangeError("2026-10-10", "2026-10-09")).toBeDefined();
    expect(bookingRangeError("2026-01-01", "2026-04-04")).toContain("93 days");
  });

  it("searches readable projected fields and marks supported attention states", () => {
    const booking = row("2026-10-08", "2026-10-15");
    for (const query of ["rb-204", "north", "pier", "ex-12", "excavator"]) expect(bookingMatchesKeyword(booking, query)).toBe(true);
    expect(bookingMatchesKeyword(booking, "unrelated")).toBe(false);
    expect(bookingAttentionLabels(booking, "2026-10-08")).toContain("Release scheduled today");
    expect(bookingAttentionLabels({ ...booking, rentalStatus: "Active", expectedReturn: "2026-10-07" }, "2026-10-08")).toContain("Return overdue");
    expect(bookingAttentionLabels({ ...booking, rentalStatus: "Returned", expectedReturn: "2026-10-07" }, "2026-10-08")).toEqual([]);
  });
});
