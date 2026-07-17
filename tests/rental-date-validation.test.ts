import { describe, expect, it } from "vitest";
import { localCalendarDate, validateNewRentalDates } from "@/features/rental/utils/rentalDateValidation";

describe("new rental date validation", () => {
  it("uses local calendar dates without UTC conversion", () => {
    expect(localCalendarDate(new Date(2026, 6, 17, 0, 30))).toBe("2026-07-17");
  });

  it("rejects past starts and returns before start", () => {
    expect(validateNewRentalDates("2026-07-16", "2026-07-18", "2026-07-17")).toContain("cannot be earlier than today");
    expect(validateNewRentalDates("2026-07-18", "2026-07-17", "2026-07-17")).toContain("cannot be earlier than the rental start");
  });

  it("accepts today, equal return dates, and valid future ranges", () => {
    expect(validateNewRentalDates("2026-07-17", undefined, "2026-07-17")).toBeUndefined();
    expect(validateNewRentalDates("2026-07-17", "2026-07-17", "2026-07-17")).toBeUndefined();
    expect(validateNewRentalDates("2026-07-18", "2026-07-20", "2026-07-17")).toBeUndefined();
  });
});
