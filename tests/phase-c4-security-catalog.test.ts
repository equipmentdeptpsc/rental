import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve("supabase/migrations/20260729001400_phase_c4_legacy_search_path_hardening.sql"),
  "utf8",
);

describe("Phase C4 legacy function search-path hardening", () => {
  it("hardens every live catalog finding without changing function bodies", () => {
    const statements = migration.match(/ALTER FUNCTION erp\./g) ?? [];
    expect(statements).toHaveLength(26);
    expect(migration).not.toMatch(/CREATE\s+(OR REPLACE\s+)?FUNCTION/i);
    expect(migration).not.toContain("DROP FUNCTION");
  });

  it("removes public from every configured function path", () => {
    expect(migration).not.toMatch(/SET search_path=[^;\n]*\bpublic\b/i);
    expect(migration).toContain("SET search_path=erp,auth");
    expect(migration).toContain("SET search_path=erp;");
  });

  it("covers authenticated commands, private helpers, and public-review wrappers", () => {
    for (const name of [
      "begin_operational_command", "finish_operational_command", "command_start_deur_shift",
      "command_close_rental", "current_company_id", "next_deur_number",
      "resolve_public_review", "public_acknowledge_customer_review", "public_reject_customer_review",
    ]) expect(migration).toContain(`erp.${name}`);
  });
});
