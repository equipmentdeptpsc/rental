import { describe, expect, it, vi } from "vitest";
import { assignmentBusinessDate, assignmentDateError } from "@/features/assignment/services/assignmentDatePolicy";
import { SupabaseAssignmentCommandRepository } from "@/integrations/supabase/SupabaseAssignmentCommandRepository";

describe("Assignment Philippine business-date policy", () => {
  it("uses the Manila calendar day across the UTC afternoon boundary", () => {
    expect(assignmentBusinessDate(new Date("2026-10-11T15:59:59Z"))).toBe("2026-10-11");
    expect(assignmentBusinessDate(new Date("2026-10-11T16:00:00Z"))).toBe("2026-10-12");
  });

  it("rejects yesterday while accepting today and future dates", () => {
    const today = "2026-10-12";
    expect(assignmentDateError({ assignedDate: "2026-10-11" }, today)).toContain("Philippine time");
    expect(assignmentDateError({ assignedDate: today }, today)).toBeUndefined();
    expect(assignmentDateError({ assignedDate: "2026-10-13" }, today)).toBeUndefined();
    expect(assignmentDateError({ assignedDate: "2026-02-30" }, today)).toContain("valid");
  });

  it("preserves an unchanged historical date but rejects changing it to another past date", () => {
    const today = "2026-10-12";
    expect(assignmentDateError({ assignedDate: "2026-10-01", originalAssignedDate: "2026-10-01", expectedReturn: "2026-10-20" }, today)).toBeUndefined();
    expect(assignmentDateError({ assignedDate: "2026-10-02", originalAssignedDate: "2026-10-01" }, today)).toContain("earlier than today");
    expect(assignmentDateError({ assignedDate: today, originalAssignedDate: "2026-10-01" }, today)).toBeUndefined();
  });

  it("rejects Expected Return before the effective start date", () => {
    expect(assignmentDateError({ assignedDate: "2026-10-12", expectedReturn: "2026-10-11" }, "2026-10-12")).toContain("on or after");
    expect(assignmentDateError({ assignedDate: "2026-10-01", originalAssignedDate: "2026-10-01", expectedReturn: "2026-09-30" }, "2026-10-12")).toContain("on or after");
  });

  it("maps direct canonical date rejections to the same clear message", async () => {
    const rpc = vi.fn(async () => ({ data: { success: false, code: "ASSIGNMENT_START_DATE_IN_PAST" }, error: null }));
    const repository = new SupabaseAssignmentCommandRepository({ schema: () => ({ rpc }) });
    const command = { commandId: "date-command", idempotencyKey: "date-command", assignmentId: "assignment", equipmentId: "equipment", operatorId: "operator", customerId: "customer", projectId: "project", assignedDate: "2026-10-11" };
    await expect(repository.createAssignment(command)).resolves.toMatchObject({ success: false, code: "ASSIGNMENT_START_DATE_IN_PAST", message: "Assigned / Start Date cannot be earlier than today (Philippine time)." });
    await expect(repository.reviseAssignment({ ...command, expectedVersion: 1, remarks: "Revision" })).resolves.toMatchObject({ success: false, code: "ASSIGNMENT_START_DATE_IN_PAST", message: "Assigned / Start Date cannot be earlier than today (Philippine time)." });
  });
});
