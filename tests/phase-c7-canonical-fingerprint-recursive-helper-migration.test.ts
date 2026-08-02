import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration03900 = fs.readFileSync(path.resolve("supabase/migrations/20260802003900_phase_c7_digital_deur_snapshot_enforcement.sql"), "utf8");
const migration04000 = fs.readFileSync(path.resolve("supabase/migrations/20260802004000_phase_c7_canonical_fingerprint_recursive_helper.sql"), "utf8");

describe("canonical fingerprint recursive helper forward correction", () => {
  it("recreates only the exact jsonb-to-text helper and preserves applied migration 03900", () => {
    expect(migration04000.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(migration04000).toContain("FUNCTION erp.canonical_deur_snapshot_text(value jsonb)");
    expect(migration04000).toContain("RETURNS text");
    expect(migration04000).not.toContain("current_deur_expectation_fingerprint(target_line_id text)");
    expect(migration03900).toContain("string_agg(canonical_deur_snapshot_text(item)");
  });

  it("schema-qualifies every recursive array and object call", () => {
    expect(migration04000.match(/erp\.canonical_deur_snapshot_text\(item\)/g)).toHaveLength(2);
    expect(migration04000).not.toMatch(/(?<!erp\.)canonical_deur_snapshot_text\(item\)/);
  });

  it("preserves canonical semantics, invoker execution and the hardened search path", () => {
    expect(migration04000).toContain("IMMUTABLE");
    expect(migration04000).toContain("SET search_path=pg_catalog");
    expect(migration04000).not.toContain("SECURITY DEFINER");
    expect(migration04000).toContain("ORDER BY ordinal");
    expect(migration04000).toContain("ORDER BY key");
    expect(migration04000).toContain("IF value IS NULL THEN RETURN 'null'");
    expect(migration04000).toContain("RETURN value::text");
    expect(migration04000).toContain("WHERE key<>'capturedAt'");
  });

  it("restores the exact owner and private ACL without browser grants", () => {
    expect(migration04000).toContain("ALTER FUNCTION erp.canonical_deur_snapshot_text(jsonb) OWNER TO postgres;");
    expect(migration04000).toContain("REVOKE ALL ON FUNCTION erp.canonical_deur_snapshot_text(jsonb) FROM PUBLIC,anon,authenticated;");
    expect(migration04000).not.toMatch(/GRANT\s+EXECUTE/i);
  });
});
