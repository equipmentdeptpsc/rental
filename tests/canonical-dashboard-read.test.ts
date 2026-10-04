import { describe, expect, it, vi } from "vitest";
import { repositoryFailure, repositorySuccess } from "@/core/persistence";
import type { ApplicationDependencies } from "@/app/composition";
import { readAllCanonicalPages, readCanonicalDashboard } from "@/features/dashboard/services/canonicalDashboardRead";

const paged = <T extends { id: string }>(items: T[], cap = 200) => ({
  list: vi.fn(async ({ paging }: { paging?: { offset?: number; limit?: number } } = {}) => {
    const offset = paging?.offset ?? 0;
    const limit = Math.min(paging?.limit ?? cap, cap);
    const rows = items.slice(offset, offset + limit);
    return repositorySuccess({ items: rows, nextCursor: rows.length === limit ? String(offset + limit) : undefined });
  }),
});

function dependencies() {
  const equipment = paged([
    { id: "e1", assetNo: "A1", equipmentName: "One", statusId: "available", active: true, deletedAt: null },
    { id: "e2", assetNo: "A2", equipmentName: "Two", statusId: "assigned", active: true, deletedAt: null },
    { id: "e3", assetNo: "A3", equipmentName: "Three", statusId: "rented", active: true, deletedAt: null },
    { id: "e4", assetNo: "A4", equipmentName: "Four", statusId: "maintenance", active: true, deletedAt: null },
    { id: "e5", assetNo: "A5", equipmentName: "Five", statusId: "available", active: false, deletedAt: null },
    { id: "e6", assetNo: "A6", equipmentName: "Six", statusId: "available", active: true, deletedAt: "2026-01-01" },
  ], 2);
  const assignments = paged([
    { id: "a1", status: "Active" }, { id: "a2", status: "Completed" },
  ], 1);
  const rentals = paged([
    { id: "r1", status: "Active", expectedReturn: "2026-10-10", approvalStatus: "Approved" },
    { id: "r2", status: "Reserved", expectedReturn: "2026-10-12", approvalStatus: "Approved" },
    { id: "r3", status: "Draft", approvalStatus: "Pending" },
    { id: "r4", status: "Returned", approvalStatus: "Approved" },
  ], 2);
  const deurs = paged([
    { id: "d1", status: "Draft" }, { id: "d2", status: "Submitted" },
    { id: "d3", status: "Rejected" }, { id: "d4", status: "In Progress", revision: { supersededByRevisionId: "d5" } },
  ], 2);
  const statusRows = ["available", "assigned", "rented", "maintenance"].map((id) => ({ id, status: id[0].toUpperCase() + id.slice(1), active: true, deleted: false }));
  const statuses = { list: vi.fn(async ({ paging }: { paging?: { offset?: number; limit?: number } } = {}) => repositorySuccess(statusRows.slice(paging?.offset ?? 0, (paging?.offset ?? 0) + Math.min(paging?.limit ?? 2, 2)))) };
  const audit = paged([{ id: "ev1", action: "EQUIPMENT_CREATED", aggregateType: "Equipment", aggregateId: "e1", occurredAt: "2026-10-01T00:00:00Z" }]);
  const reads = { equipment, assignments, rentals, deurs, canonicalAudit: audit };
  const writes = { canonicalEquipment: { createEquipment: vi.fn() }, canonicalAssignment: { createAssignment: vi.fn() } };
  return { dependencies: { readRepositories: reads, repositories: { equipmentStatusRead: statuses }, commandRepositories: writes } as unknown as ApplicationDependencies, reads, statuses, writes };
}

describe("canonical dashboard reads", () => {
  it("follows every page even when the server caps below requested size", async () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({ id: `row-${index}` }));
    const reader = paged(rows, 2);
    await expect(readAllCanonicalPages(reader as never)).resolves.toEqual(rows);
    expect(reader.list.mock.calls.map(([options]) => options?.paging?.offset)).toEqual([0, 2, 4, 5]);
  });

  it("uses canonical records for fleet and lifecycle counts without writes or Booking/Rental conflation", async () => {
    const input = dependencies();
    const model = await readCanonicalDashboard(input.dependencies, { canReadAudit: false });
    expect(model.fleetUtilization).toMatchObject({ total: 4, available: 1, assigned: 1, deployed: 1, maintenance: 1 });
    expect(model.operational).toMatchObject({ activeAssignments: 1, activeRentals: 1 });
    expect(model.pendingDeur).toBe(2);
    expect(model.financial.upcoming).toMatchObject({ scheduledRelease: 1, expectedReturns: 1, pendingManagerApprovals: 1, pendingCustomerAcknowledgements: 1 });
    expect(input.reads.canonicalAudit.list).not.toHaveBeenCalled();
    expect(input.writes.canonicalEquipment.createEquipment).not.toHaveBeenCalled();
    expect(input.writes.canonicalAssignment.createAssignment).not.toHaveBeenCalled();
  });

  it("returns an error instead of a false zero when a required reader fails", async () => {
    const input = dependencies();
    input.reads.equipment.list.mockImplementationOnce(async () => repositoryFailure("REMOTE_READ_FAILED", "Equipment unavailable", { context: {}, recoverability: "RETRYABLE", recommendedAction: "Retry" }) as never);
    await expect(readCanonicalDashboard(input.dependencies, { canReadAudit: false })).rejects.toThrow("Equipment unavailable");
  });

  it("loads recent canonical audit only for the allowed dashboard account", async () => {
    const input = dependencies();
    const model = await readCanonicalDashboard(input.dependencies, { canReadAudit: true });
    expect(model.activityAvailable).toBe(true);
    expect(model.activity).toHaveLength(1);
    expect(input.reads.canonicalAudit.list).toHaveBeenCalledTimes(1);
  });
});
