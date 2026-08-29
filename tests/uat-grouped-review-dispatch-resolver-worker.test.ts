import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("isolated UAT grouped-review resolver boundary", () => {
  const source = readFileSync("worker/uatGroupedReviewDispatchResolver.ts", "utf8");
  const index = readFileSync("worker/index.ts", "utf8");
  it("is authenticated, admin-only, permission-gated, and UAT-scoped", () => {
    expect(source).toContain("auth.getUser(token)");
    expect(source).toContain('permission_code", "settings.update"');
    expect(source).toContain('app_roles.code", "system-administrator"');
    expect(source).toContain('ENABLE_UAT_RECIPIENT_OVERRIDE_VERIFIER !== "true"');
  });
  it("resolves from target identity and rejects notification identity", () => {
    expect(source).toContain('resolve_isolated_uat_grouped_review_dispatch');
    expect(source).toContain('"notificationId" in body');
    expect(source).toContain('"reviewRequestId" in body');
    expect(source).not.toContain("dispatchExistingNotification");
  });
  it("registers a read-only POST route and preserves safe serialization", () => {
    expect(index).toContain("/api/admin/uat/resolve-grouped-review-dispatch");
    expect(source).toContain('typeof value.value !== "object"');
    expect(source).not.toMatch(/secureReviewUrl|reviewToken|encryptedEnvelope|serviceRoleKey.*value/);
  });
});
