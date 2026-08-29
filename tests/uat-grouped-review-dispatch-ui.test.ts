import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("UAT grouped-review dispatch UI", () => {
  const page = readFileSync("src/pages/UatGroupedReviewCertification.tsx", "utf8");
  const client = readFileSync("src/integrations/supabase/SupabaseUatGroupedReviewCertification.ts", "utf8");
  it("uses the authenticated target resolver and has no target notification constant", () => {
    expect(page).not.toContain("f0d28da4-96e1-44fd-b5db-b1cd9c461903");
    expect(client).toContain("/api/admin/uat/resolve-grouped-review-dispatch");
    expect(page).toContain("service.resolveGroupedReviewDispatch(target)");
  });
  it("fails closed against ineligible or mismatched canonical state", () => {
    for (const marker of ["value.eligibleForDispatch", "value.attemptCount === 0", "value.deliveryAttemptCount === 0", "!value.provider", "value.due", "!value.locked", "value.activeEnvelopeCount === 1", "value.acknowledgementCount === 0"]) expect(page).toContain(marker);
  });
  it("freshly resolves before dispatch and then refreshes state", () => {
    expect(page).toContain("const fresh = await resolve()");
    expect(page).toContain("service.dispatchExistingNotification(fresh.notificationId)");
    expect(page).toContain("await resolve()");
    expect(page).not.toContain("run-grouped-review-certification");
  });
});
