import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const assignments = readFileSync("src/pages/Assignments/index.tsx", "utf8");
const workspace = readFileSync("src/features/booking/components/CanonicalBookingOperationsWorkspace.tsx", "utf8");
const loader = readFileSync("src/features/booking/loadAllCanonicalBookingRows.ts", "utf8");
const presentation = readFileSync("src/features/booking/bookingOperationsPresentation.ts", "utf8");

describe("canonical Booking list UI", () => {
  it("keeps Assignment compatibility and exposes the separate Rental Bookings workspace", () => {
    expect(assignments).toContain('>Assignments</button>');
    expect(assignments).toContain('>Rental Bookings</button>');
    expect(assignments).toContain("<CanonicalBookingOperationsWorkspace />");
    expect(workspace).toContain('aria-label="Booking workspace views"');
    for (const view of ['"timeline"', '"kanban"', '"calendar"', '"list"']) expect(workspace).toContain(view);
  });

  it("loads every authorized page for list filters while bounding calendar and timeline by date", () => {
    expect(workspace).toContain("loadAllCanonicalBookingRows(readRepositories.canonicalBookings");
    expect(workspace).toContain('view === "calendar" || view === "timeline"');
    expect(workspace).toContain("windowStart: window.start, windowEnd: window.end");
    expect(loader).toContain("limit: 100, offset");
    expect(loader).toContain("hasMore");
    expect(loader).toContain("offset = next");
    expect(workspace).toContain("visible.slice(page * 25, (page + 1) * 25)");
  });

  it("uses authoritative return precedence and retains Rental Workspace navigation", () => {
    expect(presentation).toContain("row.actualReturn ?? row.expectedReturn ?? row.dateOut");
    expect(workspace).toContain('aria-label="Previous period"');
    expect(workspace).toContain('aria-label="Next period"');
    expect(workspace).toContain("bookingRentalWorkspacePath(row.rentalId)");
    expect(workspace).not.toContain("Return Equipment");
  });

  it("filters by customer, project, operator, equipment, status, dates, and keyword", () => {
    for (const label of ["Customer filter", "Project filter", "Operator filter", "Equipment filter", "Status filter", "Booking date from", "Booking date to", "Booking keyword search"]) expect(workspace).toContain(label);
    expect(workspace).toContain("filterBookingOperations(");
    for (const predicate of ["input.customerId", "input.projectId", "input.operatorId", "input.equipmentId", "input.status", "input.dateFrom", "input.dateTo", "input.search"]) expect(presentation).toContain(predicate);
  });

  it("uses canonical booking labels and repository-scoped operator data", () => {
    expect(workspace).toContain("readRepositories.canonicalBookings");
    expect(workspace).toContain("readRepositories.operators");
    expect(workspace).toContain("row.customerName");
    expect(workspace).toContain("row.projectName");
    expect(workspace).not.toContain("localStorage");
  });
});
