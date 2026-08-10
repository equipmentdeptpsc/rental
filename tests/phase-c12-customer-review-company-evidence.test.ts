import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260803004900_phase_c12_customer_review_company_evidence.sql",
  "utf8",
);

describe("C12 customer-review canonical company evidence", () => {
  it("derives and freezes companyName only from the active tenant company", () => {
    expect(migration).toContain("FROM erp.companies company");
    expect(migration).toContain("company.id = NEW.company_id");
    expect(migration).toContain("company.active");
    expect(migration).toContain("'{companyName}'");
    expect(migration).toContain("to_jsonb(canonical_company_name)");
    expect(migration).not.toMatch(/customer(?:s)?\.(?:name|company_name)/i);
    expect(migration).not.toMatch(/recipient_name|project/i);
  });

  it("overrides caller-shaped snapshot data at the trusted persistence boundary", () => {
    expect(migration).toContain("BEFORE INSERT ON erp.customer_review_requests");
    expect(migration).toContain("NEW.snapshot = jsonb_set");
    expect(migration).toContain("true\n  );");
    expect(migration).toContain("CANONICAL_COMPANY_REQUIRED");
  });

  it("keeps the helper private with a minimal path and unchanged public RPC grants", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = erp, pg_catalog");
    expect(migration).toContain("OWNER TO postgres");
    expect(migration).toMatch(/REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
    expect(migration).not.toMatch(/GRANT EXECUTE/i);
    expect(migration).not.toMatch(/get_public_customer_review|public_acknowledge|public_request_customer_correction/);
  });

  it("is forward-only and does not mutate historical review evidence", () => {
    expect(migration).not.toMatch(/UPDATE\s+erp\.customer_review_requests/i);
    expect(migration).not.toMatch(/ALTER\s+TABLE\s+erp\.customer_review_requests/i);
    expect(migration).not.toMatch(/token_hash|raw_token|consumed_at|status\s*=/i);
  });
});
