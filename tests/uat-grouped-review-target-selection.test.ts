import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/pages/UatGroupedReviewCertification.tsx", "utf8");
const worker = readFileSync("worker/uatGroupedReviewCertification.ts", "utf8");

describe("isolated UAT grouped-review target selection", () => {
  it("does not retain the obsolete hardcoded DEUR fixture", () => {
    expect(page).not.toContain("DEUR-2026-000001");
    expect(page).not.toContain("2026-08-26");
    expect(page).toContain("params.get(\"deurId\")");
    expect(page).toContain("params.get(\"deurNumber\")");
    expect(page).toContain("params.get(\"workDate\")");
  });

  it("requires an explicit target and preserves server validation", () => {
    expect(page).toContain("rentalId");
    expect(page).toContain("deurNumber");
    expect(page).toContain("confirmation");
    expect(worker).toContain("certify_isolated_uat_grouped_review_target");
    expect(worker).toContain("TARGET_NOT_ELIGIBLE");
    expect(worker).toContain("TARGET_RESOLUTION_UNAVAILABLE");
    expect(worker).toContain("resolve_isolated_uat_grouped_review_target");
    expect(worker).not.toContain('.from("deurs")');
    expect(worker).toContain('mode==="PREFLIGHT"');
    expect(worker).toContain('result:"ELIGIBLE"');
  });

  it("keeps recipient and provider preflight results independent", () => {
    expect(page).toContain("recipientResult===\"MATCH\"");
    expect(page).toContain("providerResult===\"VALID\"");
    expect(page).toContain("!ready");
    expect(page).toContain("Verify canonical target eligibility");
    expect(page).toContain('eligibilityResult!=="ELIGIBLE"');
    expect(worker).toContain("certify_isolated_uat_grouped_review_residue");
    expect(worker).toContain("certify_isolated_uat_grouped_review_scheduler_preflight");
    expect(worker).toContain('residueResult?.code!=="NOT_FOUND"');
  });
});
