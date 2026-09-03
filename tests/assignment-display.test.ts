import { describe, expect, it } from "vitest";
import { displayAssignmentExpectedReturn, getAssignmentNumber } from "@/features/assignment/utils/assignmentDisplay";

describe("assignment legacy Expected Return display", () => {
  it("shows a stored value or a readable fallback", () => {
    expect(displayAssignmentExpectedReturn("2026-07-20")).toBe("2026-07-20");
    expect(displayAssignmentExpectedReturn("")).toBe("—");
  });

  it("projects stable business-facing assignment numbers without exposing UUIDs", () => {
    const assignments = [
      { id: "78ccaf72-e04c-49d2-85ea-55561ff33499" },
      { id: "c1962362-d63f-44d4-87a1-b04714f32b81" },
    ] as unknown as Parameters<typeof getAssignmentNumber>[1];
    expect(getAssignmentNumber(assignments[0].id, assignments)).toBe("ASN-000001");
    expect(getAssignmentNumber(assignments[1].id, assignments)).toBe("ASN-000002");
    expect(getAssignmentNumber("missing", assignments)).toBe("ASN-UNAVAILABLE");
  });
});
