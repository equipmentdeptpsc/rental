import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.resolve("supabase/migrations/20260729001800_phase_c4_deur_event_closure_guard.sql"),
  "utf8",
);

describe("Phase C4 DEUR event closure guard", () => {
  it("permits only the intended one-way open-state closure", () => {
    expect(sql).toContain("OLD.is_open=true AND NEW.is_open=false");
    expect(sql).toContain("(to_jsonb(NEW)-'is_open')=(to_jsonb(OLD)-'is_open')");
  });

  it("continues rejecting deletes and substantive historical edits", () => {
    expect(sql).toContain("BEFORE UPDATE OR DELETE");
    expect(sql).toContain("ERRCODE='55000'");
    expect(sql).not.toContain("RETURN OLD");
  });

  it("keeps the trigger helper private with a minimal path", () => {
    expect(sql).toContain("SET search_path=erp,pg_catalog");
    expect(sql).toContain("FROM PUBLIC,anon,authenticated");
  });
});
