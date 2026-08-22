import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260822000300_canonical_rental_workspace_reads.sql", "utf8");

describe("canonical Rental workspace read boundary", () => {
  it("uses narrow security-definer projections with a safe search path", () => {
    expect(sql).toContain("FUNCTION erp.read_canonical_rental_workspace(target_rental_id text)");
    expect(sql).toContain("FUNCTION erp.read_canonical_rental_reference_data()");
    expect(sql.match(/SECURITY DEFINER/g)).toHaveLength(3);
    expect(sql.match(/SET search_path=erp,auth,pg_catalog/g)).toHaveLength(3);
    expect(sql).not.toMatch(/EXECUTE\s+format|GRANT\s+SELECT|GRANT\s+(INSERT|UPDATE|DELETE)/i);
  });

  it("derives tenant ownership through the canonical Rental and exposes no internal evidence", () => {
    expect(sql).toContain("r.id=target_rental_id AND r.company_id=tenant");
    expect(sql).toContain("c.rental_id=target_rental_id");
    expect(sql).toContain("s.rental_id=target_rental_id");
    expect(sql).not.toMatch(/'snapshotHash'|'createdBy'|'updatedBy'|'customerId'|'equipmentId'|'projectId'/);
  });

  it("uses existing Rental permissions and hides inactive reference rows", () => {
    for (const permission of ["rental.manage", "rental.commercialTerms.manage", "rental.approval.submit", "rental.approval.decide", "rental.release"]) expect(sql).toContain(permission);
    expect(sql.match(/WHERE [ca]\.active AND [ca]\.deleted_at IS NULL/g)).toHaveLength(2);
  });

  it("exposes only the authenticated RPC surface", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC,anon,authenticated,service_role/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO authenticated/);
    expect(sql).not.toMatch(/TO (?:PUBLIC|anon|service_role)\s*;/);
  });
});
