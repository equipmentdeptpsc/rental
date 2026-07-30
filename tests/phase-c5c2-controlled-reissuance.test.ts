import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260730003200_phase_c5c2_controlled_reissuance.sql";

describe("Phase C5C.2 controlled review notification reissuance", () => {
  it("adds a narrow authenticated reissuance RPC without weakening applied history", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("trusted_reissue_review_notification");
    expect(sql).toContain("FailedCredentialLost");
    expect(sql).toContain("current_company_id()");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("SECURITY DEFINER SET search_path=erp,auth,pg_catalog");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION trusted_reissue_review_notification");
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain("REVOKE ALL ON FUNCTION trusted_reissue_review_notification");
    expect(sql).not.toMatch(/TO (?:PUBLIC|anon|service_role)\s*;/i);
  });

  it("requires a bounded reason and preserves the failed delivery evidence", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/length\(btrim\(reason\)\) NOT BETWEEN 10 AND 500/);
    expect(sql).toContain("status<>'FailedCredentialLost'");
    expect(sql).not.toMatch(/UPDATE notification_delivery_attempts/i);
    expect(sql).not.toMatch(/DELETE FROM notification_delivery_attempts/i);
    expect(sql).not.toMatch(/token_hash\s*=/i);
  });

  it("binds the replacement to the same tenant, review kind, and revision", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("old_request.company_id IS DISTINCT FROM tenant");
    expect(sql).toContain("command->>'revisionId' IS DISTINCT FROM old_request.revision_id");
    expect(sql).toContain("trusted_issue_customer_review(command)");
    expect(sql).toContain("trusted_issue_manager_review(command)");
    expect(sql).toContain("'CONTROLLED_REISSUE'");
  });
});
