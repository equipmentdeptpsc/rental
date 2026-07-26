import { describe, expect, it } from "vitest";
import type { User } from "@/features/auth/user";
import type { RentalRecord } from "@/features/rental/types";
import { decideRentalApproval, getRentalApprovalStatus, invalidateRentalApproval, submitRentalApproval } from "@/features/rental/approval/rentalApproval";
import { deriveRentalQuickActions } from "@/features/rental/quick-actions/rentalQuickActions";

const admin: User = { id: "admin", name: "Admin User", role: "Admin" };
const manager: User = { id: "manager", name: "Manager User", role: "Manager" };
const operator: User = { id: "operator", name: "Operator User", role: "Operator" };
const rental = (overrides: Partial<RentalRecord> = {}): RentalRecord => ({ id: "rental-1", rentalNumber: "RENT-1", equipmentId: "equipment-1", customerId: "customer-a", projectId: "project-a", operatorId: "operator-1", customer: "Customer A", project: "Project A", rentedBy: "", dateOut: "2026-07-22", rentalType: "Operated Rental", billingMethod: "Per Hour", statusId: "", status: "Reserved", approvalStatus: "NotSubmitted", ...overrides });

describe("Rental approval state machine", () => {
  it("requires Reserved, valid terms, and an Admin to submit", () => {
    expect(submitRentalApproval(rental({ status: "Draft" }), admin, true, "2026-07-22T00:00:00Z")).toMatchObject({ success: false, code: "APPROVAL_REQUIRES_RESERVED" });
    expect(submitRentalApproval(rental(), operator, true, "2026-07-22T00:00:00Z")).toMatchObject({ success: false, code: "APPROVAL_SUBMIT_UNAUTHORIZED" });
    expect(submitRentalApproval(rental(), admin, false, "2026-07-22T00:00:00Z")).toMatchObject({ success: false, code: "APPROVAL_COMMERCIAL_TERMS_REQUIRED" });
    expect(submitRentalApproval(rental(), admin, true, "2026-07-22T00:00:00Z")).toMatchObject({ success: true, rental: { approvalStatus: "Pending", approvalRequestedBy: { id: "admin", role: "Admin" } } });
  });

  it("allows only a Manager to approve or reject and requires a rejection reason", () => {
    const pending = rental({ approvalStatus: "Pending" });
    expect(decideRentalApproval(pending, admin, "Approved", "", "2026-07-22T01:00:00Z")).toMatchObject({ success: false, code: "APPROVAL_DECISION_UNAUTHORIZED" });
    expect(decideRentalApproval(pending, manager, "Rejected", "", "2026-07-22T01:00:00Z")).toMatchObject({ success: false, code: "APPROVAL_REJECTION_REASON_REQUIRED" });
    expect(decideRentalApproval(pending, manager, "Approved", "Ready", "2026-07-22T01:00:00Z")).toMatchObject({ success: true, rental: { approvalStatus: "Approved", approvalApprovedBy: { id: "manager", role: "Manager" } } });
    expect(decideRentalApproval(pending, manager, "Rejected", "Correct dates", "2026-07-22T01:00:00Z")).toMatchObject({ success: true, rental: { approvalStatus: "Rejected", approvalDecisionRemarks: "Correct dates" } });
  });

  it("invalidates approved pre-release evidence after a material change and permits resubmission", () => {
    const approved = rental({ approvalStatus: "Approved", approvalApprovedAt: "2026-07-22T01:00:00Z", approvalApprovedBy: { id: manager.id, name: manager.name, role: manager.role } });
    const invalidated = invalidateRentalApproval(approved, admin, "Commercial Terms changed.", "2026-07-22T02:00:00Z");
    expect(invalidated.rental).toMatchObject({ approvalStatus: "NotSubmitted", approvalApprovedAt: undefined });
    expect(invalidated.event?.action).toBe("Invalidated");
    expect(submitRentalApproval(invalidated.rental, admin, true, "2026-07-22T03:00:00Z")).toMatchObject({ success: true, rental: { approvalStatus: "Pending" } });
  });

  it("preserves legacy historical Rentals without fabricating approval", () => {
    expect(getRentalApprovalStatus(rental({ status: "Released", approvalStatus: undefined }))).toBe("LegacyNotRecorded");
    expect(getRentalApprovalStatus(rental({ status: "Reserved", approvalStatus: undefined }))).toBe("NotSubmitted");
  });

  it("derives role-aware shared quick actions", () => {
    expect(deriveRentalQuickActions(rental(), "Admin").actions.map((item) => item.id)).toEqual(["submit"]);
    expect(deriveRentalQuickActions(rental({ approvalStatus: "Pending" }), "Admin")).toMatchObject({ actions: [], message: "Awaiting Manager Approval" });
    expect(deriveRentalQuickActions(rental({ approvalStatus: "Pending" }), "Manager").actions.map((item) => item.id)).toEqual(["approve", "reject"]);
    expect(deriveRentalQuickActions(rental({ approvalStatus: "Approved" }), "Admin").actions.map((item) => item.id)).toEqual(["release"]);
  });
});
