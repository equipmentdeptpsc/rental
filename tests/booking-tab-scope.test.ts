import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const assignmentsSource = readFileSync("src/pages/Assignments/index.tsx", "utf8");

describe("Bookings tab scope", () => {
  it("keeps the four-view booking workspace behind the Rental Bookings tab", () => {
    expect(assignmentsSource).toContain("tab === \"assignments\" ? <RemoteAssignmentSections data={data} /> : <CanonicalBookingOperationsWorkspace />");
    expect(assignmentsSource).not.toContain("AssignmentToolbar");
    expect(assignmentsSource).not.toContain("AssignmentBoard");
  });
});
