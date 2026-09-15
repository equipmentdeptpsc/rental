import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { calculateBusinessDashboardSummary } from "@/features/dashboard/services/businessDashboardSummary";
import { buildDashboardActionQueue } from "@/features/dashboard/services/dashboardActionQueue";
import { calculateDashboardSummary } from "@/features/dashboard/services/dashboard.service";

describe("Dashboard beta blocker", () => {
  it("counts only actionable pending Reserved Rentals for the current approver", () => {
    const rentals = [
      { id: "eligible", status: "Reserved", approvalStatus: "Pending", approvalRequestedById: "requester" },
      { id: "draft", status: "Draft", approvalStatus: "Pending", approvalRequestedById: "requester" },
      { id: "self", status: "Reserved", approvalStatus: "Pending", approvalRequestedById: "approver" },
    ] as never[];
    const summary = calculateBusinessDashboardSummary({
      statements: [], collections: [], rentals, deurs: [], currentUserId: "approver", approvalPermissionGranted: true,
    });
    expect(summary.upcoming.pendingManagerApprovals).toBe(1);
    expect(calculateBusinessDashboardSummary({ statements: [], collections: [], rentals, deurs: [], currentUserId: "approver", approvalPermissionGranted: false }).upcoming.pendingManagerApprovals).toBe(0);
  });

  it("routes manager approval action-needed work through the approval capability", () => {
    const item = buildDashboardActionQueue({ deurs: [], rentals: [], pendingManagerApprovals: 1, pendingCustomerAcknowledgements: 0, expectedReturns: 0 }).find((entry) => entry.id === "manager-approval");
    expect(item).toMatchObject({ permission: "rental.approval.decide", href: "/rentals?view=approvals", count: 1 });
  });

  it("projects canonical equipment and Rental state into operational KPIs", () => {
    const summary = calculateDashboardSummary(
      [{ id: "equipment-1", status: "Available" } as never],
      [],
      [{ id: "rental-1", status: "Active" } as never],
      [],
    );
    expect(summary.totalEquipment).toBe(1);
    expect(summary.activeRentals).toBe(1);
  });

  it("keeps the remote boundary and loading/error/empty distinction explicit", () => {
    const hook = readFileSync("src/features/dashboard/hooks/useDashboardViewModel.ts", "utf8");
    const page = readFileSync("src/pages/Dashboard/index.tsx", "utf8");
    const rentalsPage = readFileSync("src/pages/Rental/index.tsx", "utf8");
    expect(hook).toContain("readRepositories.equipment.list()");
    expect(hook).toContain("readRepositories.rentals.list()");
    expect(hook).toContain('status: "loading" | "loaded" | "error"');
    expect(page).toContain("Loading canonical dashboard data");
    expect(page).toContain("ErrorState");
    expect(page).toContain("No equipment in the system yet");
    expect(rentalsPage).toContain('requestedView === "approvals"');
    expect(rentalsPage).toContain('rental.status === "Reserved" && rental.approvalStatus === "Pending"');
  });
});
