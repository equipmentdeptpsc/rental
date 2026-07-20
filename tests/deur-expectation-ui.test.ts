import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import RentalDeurComplianceSummary from "@/features/rental/deur/compliance/RentalDeurComplianceSummary";
import type { RentalDeurComplianceResult } from "@/features/rental/deur/compliance/evaluateRentalDeurCompliance";

describe("policy-aware DEUR monitoring UI", () => {
  it("renders policy counts and readable expectation references without exposing an internal ID", async () => {
    const result: RentalDeurComplianceResult = {
      rentalId: "internal-rental", required: true, status: "MISSING_DEUR", reason: "Missing", source: "EXPLICIT_POLICY",
      expectedCount: 5, compliantCount: 3, missingCount: 1, incompleteCount: 1, pendingCorrectionCount: 0,
      counts: { total: 4, effective: 3, incomplete: 1, pendingCorrections: 0, superseded: 0 }, issues: [],
      expectations: [{ expectationId: "internal-expectation", rentalId: "internal-rental", workDate: "2026-07-18", shiftCode: "DAY", expectationStatus: "DUE", source: "EXPLICIT_POLICY", status: "INCOMPLETE", matchingEffectiveDeurId: "internal-deur", matchingDeurNumber: "DEUR-00127", matchingRevisionNumber: 1, reason: "Awaiting acknowledgement" }],
    };
    const container = document.createElement("div"), root = createRoot(container);
    await act(async () => root.render(createElement(RentalDeurComplianceSummary, { result, policy: { frequency: "PER_SHIFT", effectiveFrom: "2026-07-17", expectedShiftCodes: ["DAY", "NIGHT"], capturedAt: "2026-07-17T00:00:00Z" } })));
    for (const text of ["Expected: 5", "Acknowledged: 3", "Incomplete: 1", "Missing: 1", "Pending Correction: 0", "Per Shift — DAY, NIGHT", "2026-07-18", "DEUR-00127 R1", "Awaiting acknowledgement"]) expect(container.textContent).toContain(text);
    expect(container.textContent).not.toContain("internal-deur");
    await act(async () => root.unmount());
  });
});
