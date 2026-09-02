import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/pages/UatGroupedReviewCertification.tsx", "utf8");

describe("limited pilot inspector refresh action", () => {
  it("refreshes only the existing authenticated pilot read boundary", () => {
    const refresh = page.slice(page.indexOf("const inspectLimitedPilot"), page.indexOf("const inspectDailyEligibility"));
    expect(page).toContain("Refresh Limited Pilot Inspection");
    expect(refresh).toContain("service.inspectLimitedPilotBusinessDate()");
    expect(refresh).toContain("service.inspectLimitedPilotDeurs()");
    expect(refresh).not.toContain("inspectMultiEquipmentCertification");
    expect(refresh).not.toContain("provision");
  });

  it("separates pilot state from the multi-equipment inspection and reports request state", () => {
    expect(page).toContain("const [pilotInspection,setPilotInspection]");
    expect(page).toContain("const [pilotInspectionError,setPilotInspectionError]");
    expect(page).toContain("const [pilotInspecting,setPilotInspecting]");
    expect(page).toContain("disabled={pilotInspecting}");
    expect(page).toContain("LIMITED_PILOT_INSPECTION_FAILED");
  });
});
