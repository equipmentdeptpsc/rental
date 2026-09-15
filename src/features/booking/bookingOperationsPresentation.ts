import type { CanonicalBookingListItem, CanonicalBookingStatus } from "./canonical";

export type BookingPresentationStatus = "Requested" | "Confirmed" | "Checked out" | "Returned";
export interface BookingPresentationRow extends CanonicalBookingListItem { presentationStatus: BookingPresentationStatus; endDate: string; overdue: boolean; conflict: boolean; }

const operational = new Set<CanonicalBookingStatus>(["Draft", "Assigned", "Reserved", "Released", "Active"]);
export const bookingEndDate = (row: CanonicalBookingListItem) => (row.actualReturn ?? row.expectedReturn ?? row.dateOut).slice(0, 10);
export function bookingPresentationStatus(status: CanonicalBookingStatus): BookingPresentationStatus {
  if (["Draft", "Assigned"].includes(status)) return "Requested";
  if (status === "Reserved") return "Confirmed";
  if (["Released", "Active"].includes(status)) return "Checked out";
  return "Returned";
}
const overlaps = (left: CanonicalBookingListItem, right: CanonicalBookingListItem) => left.dateOut.slice(0, 10) <= bookingEndDate(right) && bookingEndDate(left) >= right.dateOut.slice(0, 10);
export function normalizeBookingOperations(rows: readonly CanonicalBookingListItem[], today: string): BookingPresentationRow[] {
  return rows.map((row) => {
    const endDate = bookingEndDate(row);
    const conflict = operational.has(row.rentalStatus) && rows.some((candidate) => candidate.rentalEquipmentLineId !== row.rentalEquipmentLineId && candidate.equipmentId === row.equipmentId && operational.has(candidate.rentalStatus) && overlaps(row, candidate));
    return { ...row, endDate, presentationStatus: bookingPresentationStatus(row.rentalStatus), overdue: ["Released", "Active"].includes(row.rentalStatus) && !row.actualReturn && Boolean(row.expectedReturn && row.expectedReturn.slice(0, 10) < today), conflict };
  });
}
export function filterBookingOperations(rows: readonly BookingPresentationRow[], input: { equipmentId?: string; status?: BookingPresentationStatus; search?: string }): BookingPresentationRow[] {
  const query = input.search?.trim().toLowerCase() ?? "";
  return rows.filter((row) => (!input.equipmentId || row.equipmentId === input.equipmentId) && (!input.status || row.presentationStatus === input.status) && (!query || `${row.rentalNumber ?? ""} ${row.customerName ?? ""} ${row.projectName ?? ""} ${row.equipmentName ?? ""} ${row.equipmentAssetNumber ?? ""}`.toLowerCase().includes(query)));
}
