import type { Role } from "@/features/auth/role";
import type { RentalRecord } from "../types";
import { getRentalApprovalStatus } from "../approval/rentalApproval";

export type RentalQuickActionId = "reserve" | "submit" | "approve" | "reject" | "release" | "activate" | "return" | "close";
export interface RentalQuickAction { id: RentalQuickActionId; label: string; }
export interface RentalQuickActionModel { actions: RentalQuickAction[]; message?: string; }

export function deriveRentalQuickActions(rental: RentalRecord, role?: Role): RentalQuickActionModel {
  const approval = getRentalApprovalStatus(rental);
  if (rental.status === "Draft") return { actions: role === "Admin" ? [{ id: "reserve", label: "Reserve Rental" }] : [] };
  if (rental.status === "Reserved") {
    if (approval === "Pending") return role === "Manager" ? { actions: [{ id: "approve", label: "Approve Rental" }, { id: "reject", label: "Reject Rental" }], message: "Awaiting Manager Approval" } : { actions: [], message: "Awaiting Manager Approval" };
    if (approval === "Approved") return { actions: role === "Admin" ? [{ id: "release", label: "Release Equipment" }] : [], message: "Manager Approved" };
    if (approval === "Rejected") return { actions: role === "Admin" ? [{ id: "submit", label: "Send to Approver" }] : [], message: rental.approvalDecisionRemarks ? `Rejected: ${rental.approvalDecisionRemarks}` : "Manager Rejected" };
    return { actions: role === "Admin" ? [{ id: "submit", label: "Send to Approver" }] : [] };
  }
  if (rental.status === "Released") return { actions: role === "Admin" ? [{ id: "activate", label: "Activate Rental" }] : [] };
  if (rental.status === "Active") return { actions: role === "Admin" ? [{ id: "return", label: "Return Equipment" }] : [] };
  if (rental.status === "Returned") return { actions: role === "Admin" ? [{ id: "close", label: "Close Rental" }] : [] };
  return { actions: [] };
}
