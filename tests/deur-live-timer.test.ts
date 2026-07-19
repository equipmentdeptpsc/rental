import { describe, expect, it } from "vitest";

import { getDeurActivityElapsedSeconds } from "@/features/rental/deur/services/getDeurActivityElapsedSeconds";
import type { DeurActivityLog } from "@/features/rental/deur/types";

function activity(overrides: Partial<DeurActivityLog> = {}): DeurActivityLog {
  return {
    id: "activity-1",
    activity: "Operation",
    startTime: "08:15",
    durationMinutes: 0,
    ...overrides,
  };
}

describe("DEUR live activity timer", () => {
  it("derives a running activity duration from its work date and current time", () => {
    expect(
      getDeurActivityElapsedSeconds(
        activity(),
        "2026-07-19",
        new Date("2026-07-19T09:45:30"),
      ),
    ).toBe(5_430);
  });

  it("continues a running activity across midnight", () => {
    expect(
      getDeurActivityElapsedSeconds(
        activity({ startTime: "23:50" }),
        "2026-07-19",
        new Date("2026-07-20T00:10:15"),
      ),
    ).toBe(1_215);
  });

  it("keeps completed activity evidence stable instead of extending it", () => {
    expect(
      getDeurActivityElapsedSeconds(
        activity({ endTime: "09:00", durationMinutes: 45 }),
        "2026-07-19",
        new Date("2026-07-19T12:00:00"),
      ),
    ).toBe(2_700);
  });

  it("returns zero for malformed or future activity evidence", () => {
    expect(
      getDeurActivityElapsedSeconds(
        activity({ startTime: "not-a-time" }),
        "2026-07-19",
        new Date("2026-07-19T12:00:00"),
      ),
    ).toBe(0);
    expect(
      getDeurActivityElapsedSeconds(
        activity({ startTime: "13:00" }),
        "2026-07-19",
        new Date("2026-07-19T12:00:00"),
      ),
    ).toBe(0);
  });
});
