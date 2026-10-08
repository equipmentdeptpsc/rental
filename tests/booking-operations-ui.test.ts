import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const assignmentsSource = readFileSync("src/pages/Assignments/index.tsx", "utf8");
const workspaceSource = readFileSync("src/features/booking/components/CanonicalBookingOperationsWorkspace.tsx", "utf8");

describe("Rental Bookings operations UI", () => {
  it("connects Rental Bookings to the canonical four-view workspace", () => {
    expect(assignmentsSource).toContain("CanonicalBookingOperationsWorkspace");
    expect(workspaceSource).toContain('"timeline"');
    expect(workspaceSource).toContain('"kanban"');
    expect(workspaceSource).toContain('"calendar"');
    expect(workspaceSource).toContain('"list"');
    expect(workspaceSource).toContain("searchCanonicalBookingCalendarRows");
    expect(workspaceSource).toContain("filterBookingOperations");
    expect(workspaceSource).toContain("bookings could not be loaded.");
  });

  it("keeps workspace failures local and navigation read-only", () => {
    expect(workspaceSource).toContain('role="alert"');
    expect(workspaceSource).toContain("View Rental");
    expect(workspaceSource).toContain("No bookings match the selected filters.");
    expect(workspaceSource).not.toContain(">Reserve</button>");
    expect(workspaceSource).not.toContain(">Activate</button>");
    expect(workspaceSource).not.toContain(">Return</button>");
  });
});
