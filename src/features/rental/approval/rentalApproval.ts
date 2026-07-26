import type { User } from "@/features/auth/user";
import type { RentalApprovalActor, RentalApprovalEvent, RentalApprovalStatus, RentalRecord } from "../types";

export type RentalApprovalResult = { success: true; rental: RentalRecord; event: RentalApprovalEvent } | { success: false; code: string; message: string };

export function getRentalApprovalStatus(rental: Pick<RentalRecord, "status" | "approvalStatus">): RentalApprovalStatus | "LegacyNotRecorded" {
  if (rental.approvalStatus) return rental.approvalStatus;
  return ["Released", "Active", "Returned", "Closed"].includes(rental.status) ? "LegacyNotRecorded" : "NotSubmitted";
}

const actor = (user: User): RentalApprovalActor => ({ id: user.id, name: user.name, role: user.role });
const event = (action: RentalApprovalEvent["action"], previousStatus: RentalApprovalStatus, resultingStatus: RentalApprovalStatus, timestamp: string, user?: User, remarks?: string): RentalApprovalEvent => ({ id: crypto.randomUUID(), action, timestamp: new Date(timestamp).toISOString(), ...(user ? { actor: actor(user) } : {}), previousStatus, resultingStatus, ...(remarks?.trim() ? { remarks: remarks.trim() } : {}) });

export function submitRentalApproval(rental: RentalRecord, user: User | null, commercialTermsValid: boolean, timestamp: string): RentalApprovalResult {
  if (user?.role !== "Admin") return { success: false, code: "APPROVAL_SUBMIT_UNAUTHORIZED", message: "Only an Admin can send a Rental for approval." };
  if (rental.status !== "Reserved") return { success: false, code: "APPROVAL_REQUIRES_RESERVED", message: "Only a Reserved Rental can be sent for approval." };
  const previous = getRentalApprovalStatus(rental);
  if (previous === "Pending") return { success: false, code: "APPROVAL_ALREADY_PENDING", message: "This Rental is already awaiting Manager approval." };
  if (previous === "Approved") return { success: false, code: "APPROVAL_ALREADY_APPROVED", message: "This Rental is already approved." };
  if (previous === "LegacyNotRecorded") return { success: false, code: "APPROVAL_HISTORICAL", message: "Historical Rental approval cannot be changed." };
  if (!commercialTermsValid) return { success: false, code: "APPROVAL_COMMERCIAL_TERMS_REQUIRED", message: "Valid Commercial Terms are required before approval can be requested." };
  const requiresResubmission=previous==="Rejected"||(rental.approvalHistory??[]).some(item=>item.action==="Invalidated");
  const nextEvent = event(requiresResubmission ? "Resubmitted" : "Submitted", previous, "Pending", timestamp, user);
  return { success: true, event: nextEvent, rental: { ...rental, approvalStatus: "Pending", approvalRequestedAt: nextEvent.timestamp, approvalRequestedBy: actor(user), approvalDecisionRemarks: undefined, approvalHistory: [...(rental.approvalHistory ?? []), nextEvent] } };
}

export function decideRentalApproval(rental: RentalRecord, user: User | null, decision: "Approved" | "Rejected", remarks: string, timestamp: string): RentalApprovalResult {
  if (user?.role !== "Manager") return { success: false, code: "APPROVAL_DECISION_UNAUTHORIZED", message: "Only a Manager can approve or reject a Rental." };
  if (rental.status !== "Reserved" || getRentalApprovalStatus(rental) !== "Pending") return { success: false, code: "APPROVAL_NOT_PENDING", message: "Only a pending Reserved Rental can be approved or rejected." };
  if (decision === "Rejected" && !remarks.trim()) return { success: false, code: "APPROVAL_REJECTION_REASON_REQUIRED", message: "A rejection reason is required." };
  const nextEvent = event(decision, "Pending", decision, timestamp, user, remarks);
  const common = { ...rental, approvalStatus: decision, approvalDecisionRemarks: remarks.trim() || undefined, approvalHistory: [...(rental.approvalHistory ?? []), nextEvent] };
  return decision === "Approved"
    ? { success: true, event: nextEvent, rental: { ...common, approvalApprovedAt: nextEvent.timestamp, approvalApprovedBy: actor(user), approvalRejectedAt: undefined, approvalRejectedBy: undefined } }
    : { success: true, event: nextEvent, rental: { ...common, approvalRejectedAt: nextEvent.timestamp, approvalRejectedBy: actor(user), approvalApprovedAt: undefined, approvalApprovedBy: undefined } };
}

export function invalidateRentalApproval(rental: RentalRecord, user: User | null, reason: string, timestamp: string): { rental: RentalRecord; event?: RentalApprovalEvent } {
  if (rental.status !== "Reserved" || !["Approved","Pending"].includes(rental.approvalStatus??"")) return { rental };
  const previousStatus=rental.approvalStatus as "Approved"|"Pending";
  const nextEvent = event("Invalidated", previousStatus, "NotSubmitted", timestamp, user ?? undefined, reason);
  return { event: nextEvent, rental: { ...rental, approvalStatus: "NotSubmitted", approvalApprovedAt: undefined, approvalApprovedBy: undefined, approvalDecisionRemarks: reason, approvalHistory: [...(rental.approvalHistory ?? []), nextEvent] } };
}
