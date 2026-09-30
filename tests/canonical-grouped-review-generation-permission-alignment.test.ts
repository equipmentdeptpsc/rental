import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260930000700_canonical_grouped_review_generation_permission.sql", "utf8");

it("moves browser generation to the canonical issue permission while preserving scheduler compatibility", () => {
  expect(migration).toContain("erp.command_generate_customer_review_batch(jsonb)");
  expect(migration).toContain("deur.customerReview.issue");
  expect(migration).toContain("OR erp.current_user_has_permission(''deur.review'')");
  expect(migration).toContain("expected grouped-review legacy authorization gate was not found");
});

it("does not grant the browser command to anonymous or service roles", () => {
  expect(migration).toContain("REVOKE ALL ON FUNCTION erp.command_generate_customer_review_batch(jsonb) FROM PUBLIC, anon, service_role");
  expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.command_generate_customer_review_batch(jsonb) TO authenticated");
  expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION erp\.command_generate_customer_review_batch\(jsonb\) TO (?:anon|service_role)/);
});

it("makes the canonical issuance permission available to the typed browser authorization boundary", () => {
  const permissions = readFileSync("src/features/auth/domain/permission.ts", "utf8");
  expect(permissions).toContain('"deur.customerReview.issue"');
});
