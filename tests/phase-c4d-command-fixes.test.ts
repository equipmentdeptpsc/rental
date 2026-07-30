import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260729002400_phase_c4d_command_lookup_and_status_fix.sql"),
  "utf8",
);

describe("Phase C4D verified command fixes", () => {
  it("tenant-qualifies DEUR transition and completion lookups", () => {
    expect(sql).toContain("FROM erp.deurs AS d");
    expect(sql.split("d.id=(command->>'deurId') AND d.company_id=tenant")).toHaveLength(3);
    expect(sql).toContain("IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND')");
  });

  it("resolves the available Equipment Status foreign key instead of writing a literal id", () => {
    expect(sql).toContain("SELECT es.id INTO available_status");
    expect(sql).toContain("lower(es.code)='available'");
    expect(sql).toContain("status_id=available_status");
    expect(sql).not.toContain("status_id='available'");
  });

  it("preserves private command boundaries and explicit search paths", () => {
    expect(sql.match(/SECURITY DEFINER SET search_path=erp,auth/g)).toHaveLength(3);
    expect(sql).toContain("FROM PUBLIC,anon,service_role");
    expect(sql).toContain("TO authenticated");
  });
});
