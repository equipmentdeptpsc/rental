import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bookingRentalWorkspacePath } from "@/features/booking/bookingOperationsPresentation";

const workspaceSource = readFileSync("src/features/booking/components/CanonicalBookingOperationsWorkspace.tsx", "utf8");

describe("canonical booking rental navigation", () => {
  it("builds the existing canonical Rental workspace route", () => {
    expect(bookingRentalWorkspacePath("0ac5c327-2d47-46e9-b94f-2b77deb27427")).toBe("/rentals/0ac5c327-2d47-46e9-b94f-2b77deb27427/workspace");
  });

  it("uses the same canonical Rental route from every booking view", () => {
    expect(workspaceSource.match(/bookingRentalWorkspacePath\(row\.rentalId\)/g)?.length).toBe(5);
    expect(workspaceSource).not.toContain('to={`/rentals/${row.rentalId}`}');
  });
});
