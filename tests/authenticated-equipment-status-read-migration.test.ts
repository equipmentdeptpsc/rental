import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260822000350_authenticated_equipment_status_read.sql", "utf8");

describe("authenticated Equipment Status read boundary migration", () => {
  it("preserves RLS and grants authenticated only the established bounded columns", () => {
    expect(sql).toMatch(/ALTER TABLE equipment_statuses ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE equipment_statuses FROM authenticated/i);
    expect(sql).toMatch(/GRANT SELECT \(id, code, name, description, active, deleted_at, sort_order\)\s+ON equipment_statuses TO authenticated/i);
    expect(sql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)/i);
  });

  it("adds only the authenticated non-deleted read policy and leaves anon unchanged", () => {
    expect(sql).toMatch(/CREATE POLICY equipment_statuses_authenticated_read[\s\S]+FOR SELECT[\s\S]+TO authenticated[\s\S]+USING \(deleted_at IS NULL\)/i);
    expect(sql).not.toMatch(/(?:GRANT|REVOKE|CREATE POLICY)[^;]*\banon\b/i);
    expect(sql).not.toMatch(/(?:GRANT|REVOKE|CREATE POLICY)[^;]*\b(?:PUBLIC|service_role)\b/i);
  });
});
