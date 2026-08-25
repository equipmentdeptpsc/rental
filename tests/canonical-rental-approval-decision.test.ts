import { describe, expect, it } from "vitest";
import { evaluateCanonicalApprovalDecisionEligibility } from "@/features/rental/approval/canonicalApprovalDecisionEligibility";
import { mapRental } from "@/integrations/supabase/readRepositories";

const requesterId = "8c570101-e232-4151-8d73-e3288a8d3c15";
const rawPendingRental = {
  id: "0ac5c327-2d47-46e9-b94f-2b77deb27427",
  rental_number: "RNT-2026-000001",
  status: "Draft",
  approval_status: "Pending",
  row_version: 4,
  rental_type: "Operated Rental",
  approval_requested_by: requesterId,
  approval_requested_at: "2026-08-25T04:34:13.776714+00:00",
  commercial_snapshot_required: false,
  deur_expectation_policy_required: false,
  operational_metadata: {},
};

describe("canonical Rental approval decision eligibility", () => {
  it("maps the real pending UAT state and blocks the submitting actor from Approve and Reject", () => {
    const mapped = mapRental(rawPendingRental);
    expect(mapped.success).toBe(true);
    if (!mapped.success) return;
    expect(mapped.value).toMatchObject({ status: "Draft", approvalStatus: "Pending", rowVersion: 4, approvalRequestedById: requesterId });
    expect(mapped.value.approvalRequestedBy).toBeUndefined();
    expect(evaluateCanonicalApprovalDecisionEligibility(mapped.value, requesterId, true)).toEqual({ eligible: false, reason: "REQUESTER_CANNOT_DECIDE", message: "A different authorized user must approve or reject this Rental." });
  });

  it("allows a different authorized decision actor and rejects missing permission", () => {
    const mapped = mapRental(rawPendingRental);
    if (!mapped.success) throw new Error("Fixture mapping failed");
    expect(evaluateCanonicalApprovalDecisionEligibility(mapped.value, "different-authorized-manager", true)).toEqual({ eligible: true });
    expect(evaluateCanonicalApprovalDecisionEligibility(mapped.value, "different-user", false)).toMatchObject({ eligible: false, reason: "PERMISSION_REQUIRED" });
  });
});
