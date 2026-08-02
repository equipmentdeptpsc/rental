import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.resolve("supabase/migrations/20260802003900_phase_c7_digital_deur_snapshot_enforcement.sql"), "utf8");

describe("digital DEUR snapshot enforcement migration", () => {
  it("rejects absent and stale snapshots before idempotency or persistence", () => {
    expect(sql).toContain("'DEUR_EXPECTATION_REQUIRED'");
    expect(sql).toContain("'SNAPSHOT_STALE'");
    expect(sql.indexOf("snap IS NULL")).toBeLessThan(sql.indexOf("idem=begin_deur_command"));
  });
  it("persists protected DEUR fields only from the frozen snapshot", () => {
    for (const source of ["snap->>'rentalId'", "snap->>'assignmentId'", "snap->>'operatorId'", "snap->>'projectId'", "snap->>'workDate'", "snap->>'billingMethod'", "snap->'operationalMetadata'", "snap->'workDescription'"]) expect(sql).toContain(source);
    expect(sql).not.toMatch(/command->'draft'->'operationalMetadata'/);
    expect(sql).not.toMatch(/command->'draft'->>'workDate'/);
    expect(sql).not.toMatch(/command->'draft'->>'evidenceMode'/);
  });
  it("adds canonical fingerprint freshness without removing relationship validation", () => {
    expect(sql).toContain("canonical_deur_snapshot_text");
    expect(sql).toContain("current_deur_expectation_fingerprint");
    expect(sql).toContain("'snapshotFreshness'");
    expect(sql).toContain("'RELEASE_NOT_READY','SNAPSHOT_STALE'");
    for (const field of ["assignment", "operator", "project", "equipment", "billingTerms"]) expect(sql).toContain(`'${field}'`);
  });
  it("keeps internal helpers private and RPC search paths explicit", () => {
    expect(sql).toContain("FROM PUBLIC,anon,authenticated");
    expect(sql).toContain("TO authenticated");
    expect(sql).toMatch(/SET search_path=erp,pg_catalog/);
  });
  it("uses one schema-qualified ownership statement per exact function signature", () => {
    const ownership = sql.match(/ALTER FUNCTION[^;]+OWNER TO postgres;/g) ?? [];
    expect(ownership).toEqual([
      "ALTER FUNCTION erp.canonical_deur_snapshot_text(jsonb) OWNER TO postgres;",
      "ALTER FUNCTION erp.current_deur_expectation_fingerprint(text) OWNER TO postgres;",
      "ALTER FUNCTION erp.rental_release_readiness(text) OWNER TO postgres;",
      "ALTER FUNCTION erp.command_start_deur_shift(jsonb) OWNER TO postgres;",
    ]);
    for (const statement of ownership) expect(statement.match(/\([^)]*\)/g)).toHaveLength(1);
  });
});
