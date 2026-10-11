import { describe, expect, it, vi } from "vitest";
import { repositorySuccess } from "@/core/persistence";
import { loadAllAuthorizedPages } from "@/core/remote/loadAllAuthorizedPages";
import { loadAllCanonicalBookingRows } from "@/features/booking/loadAllCanonicalBookingRows";
import { filterBookingOperations, normalizeBookingOperations } from "@/features/booking/bookingOperationsPresentation";
import { filterCanonicalAssignmentBookings, emptyAssignmentBookingFilters } from "@/features/assignment/services/filterCanonicalAssignmentBookings";
import { filterRentalList } from "@/features/rental/services/filterRentalList";
import type { CanonicalBookingReadRepository, CanonicalBookingListItem } from "@/features/booking/canonical";
import type { CanonicalAssignmentData } from "@/features/assignment/hooks/useCanonicalAssignmentData";
import type { RentalRecord } from "@/features/rental/types";

describe("complete canonical list filtering", () => {
  it("loads every authorized repository page before filtering", async () => {
    const list = vi.fn(async (options: { paging: { offset: number; limit: number } }) => repositorySuccess({ items: options.paging.offset ? [{ id: "last" }] : Array.from({ length: 500 }, (_, i) => ({ id: `first-${i}` })), nextCursor: options.paging.offset ? undefined : "500" }));
    const result = await loadAllAuthorizedPages({ list } as never);
    expect(result.success && result.value).toHaveLength(501);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[1][0].paging.offset).toBe(500);
  });
  it("loads every canonical Booking RPC page for List and calendar windows", async () => {
    const row = (id: string): CanonicalBookingListItem => ({ rentalId: id, rentalStatus: "Reserved", rentalEquipmentLineId: id, equipmentId: "e1", dateOut: "2026-10-10", createdAt: "2026-10-01" });
    const fetchPage = async (input: { offset?: number }) => repositorySuccess({ rows: [row(String(input.offset ?? 0))], totalCount: 2, offset: input.offset ?? 0, limit: 1, hasMore: !input.offset });
    const searchCanonicalBookingRows = vi.fn(fetchPage);
    const searchCanonicalBookingCalendarRows = vi.fn(fetchPage);
    const repository = { searchCanonicalBookingRows, searchCanonicalBookingCalendarRows } as unknown as CanonicalBookingReadRepository;
    expect(await loadAllCanonicalBookingRows(repository)).toHaveLength(2);
    expect(await loadAllCanonicalBookingRows(repository, { windowStart: "2026-10-01", windowEnd: "2026-10-31" })).toHaveLength(2);
    expect(searchCanonicalBookingRows).toHaveBeenCalledTimes(2);
    expect(searchCanonicalBookingCalendarRows).toHaveBeenCalledTimes(2);
  });
  it("filters cross-reference Assignment fields, status and dates after all pages", () => {
    const data: CanonicalAssignmentData = { assignments: [
      { id: "a1", equipmentId: "e1", operatorId: "o1", projectId: "p1", assignedDate: "2026-10-10", expectedReturn: "2026-10-11", remarks: "", status: "Active" },
      { id: "a2", equipmentId: "e2", operatorId: "o2", projectId: "p2", assignedDate: "2026-10-12", expectedReturn: "2026-10-20", remarks: "", status: "Active" },
    ], equipment: [{ id: "e1", assetNo: "ME-1", equipmentName: "First", active: true, deleted: false }, { id: "e2", assetNo: "ME-2", equipmentName: "Second", active: true, deleted: false }], operators: [{ id: "o1", name: "First", status: "Active", deleted: false }, { id: "o2", name: "Second", status: "Active", deleted: false }], projects: [{ id: "p1", name: "First", active: true, customerId: "c1" }, { id: "p2", name: "Second", active: true, customerId: "c2" }], customers: [{ id: "c1", name: "First", active: true }, { id: "c2", name: "Second", active: true }] };
    expect(filterCanonicalAssignmentBookings(data, { ...emptyAssignmentBookingFilters(), customerId: "c2", operatorId: "o2", dateFrom: "2026-10-12" }, "2026-10-13").map((item) => item.id)).toEqual(["a2"]);
    expect(filterCanonicalAssignmentBookings(data, { ...emptyAssignmentBookingFilters(), status: "Overdue" }, "2026-10-13").map((item) => item.id)).toEqual(["a1"]);
  });
  it("filters Booking and Rental equipment, operator, customer and interval without losing navigation IDs", () => {
    const booking = normalizeBookingOperations([{ rentalId: "r1", rentalStatus: "Reserved", rentalEquipmentLineId: "l1", equipmentId: "e1", customerId: "c1", projectId: "p1", rentalNumber: "R-1", dateOut: "2026-10-10", expectedReturn: "2026-10-15", createdAt: "2026-10-01" }], "2026-10-11").map((item) => ({ ...item, operatorId: "o1", operatorName: "Operator One" }));
    expect(filterBookingOperations(booking, { operatorId: "o1", customerId: "c1", dateFrom: "2026-10-12", search: "R-1" })[0].rentalId).toBe("r1");
    expect(filterBookingOperations(booking, { dateFrom: "2026-10-16" })).toHaveLength(0);
    const rental = { id: "r1", rentalNumber: "R-1", customerId: "c1", projectId: "p1", equipmentId: "e1", operatorId: "o1", customer: "Customer", project: "Project", dateOut: "2026-10-10", expectedReturn: "2026-10-15", status: "Reserved" } as RentalRecord;
    expect(filterRentalList({ rentals: [rental], lines: [], equipment: [], operators: [], query: "", filters: { customerId: "c1", operatorId: "o1", dateFrom: "2026-10-12" } })).toEqual([rental]);
    expect(filterRentalList({ rentals: [rental], lines: [], equipment: [], operators: [], query: "", filters: { dateFrom: "2026-10-16" } })).toEqual([]);
  });
});
