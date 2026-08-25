import type { RentalRecord } from "../types";

export interface CanonicalApprovalDecisionEligibility {
  eligible: boolean;
  reason?: "PERMISSION_REQUIRED" | "REQUESTER_CANNOT_DECIDE";
  message?: string;
}

/** Mirrors UI-visible authorization prerequisites; the canonical RPC remains authoritative. */
export function evaluateCanonicalApprovalDecisionEligibility(
  rental: Pick<RentalRecord, "approvalRequestedById">,
  currentUserId: string | undefined,
  permissionGranted: boolean,
): CanonicalApprovalDecisionEligibility {
  if (!permissionGranted) return { eligible: false, reason: "PERMISSION_REQUIRED", message: "Rental approval permission is required." };
  if (currentUserId && rental.approvalRequestedById === currentUserId) return {
    eligible: false,
    reason: "REQUESTER_CANNOT_DECIDE",
    message: "A different authorized user must approve or reject this Rental.",
  };
  return { eligible: true };
}
