import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/Assignments/index.tsx", "utf8");

describe("canonical Booking list UI", () => {
  it("keeps Assignment compatibility and adds a separate Rental Bookings view", () => {
    expect(source).toContain('>Assignments</button>');
    expect(source).toContain('>Rental Bookings</button>');
    expect(source).toContain("readRepositories.canonicalBookings.searchCanonicalBookingRows");
    expect(source).toContain("One row per Rental Equipment Line");
  });

  it("uses server predicates and bounded pagination rather than local post-filtering", () => {
    expect(source).toContain("offset: 0");
    expect(source).toContain("limit: 25");
    expect(source).toContain("filters.status");
    expect(source).toContain("filters.rentalNumberSearch");
    expect(source).toContain("hasMore");
  });

  it("keeps secondary labels permission-gated and exposes navigation only", () => {
    expect(source).toContain('hasPermission("customer.read")');
    expect(source).toContain('hasPermission("project.read")');
    expect(source).toContain('hasPermission("equipment.read")');
    expect(source).toContain("Open Rental");
    expect(source).not.toContain("Return Equipment");
  });

  it("loads filter options independently from bounded canonical readers", () => {
    expect(source).toContain("readRepositories.customers.list({ paging: { limit: 100 }");
    expect(source).toContain("readRepositories.projects.list({ paging: { limit: 100 }");
    expect(source).toContain("readRepositories.equipment.list({ paging: { limit: 100 }");
    expect(source).not.toContain("const options = page?.rows");
  });
});
