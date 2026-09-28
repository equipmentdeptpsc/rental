import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260929000800_manual_deur_submit_timeline_diagnostics.sql"), "utf8");

describe("manual correction resubmission timeline diagnostics", () => {
  it("patches the canonical manual submit command only", () => {
    expect(migration).toContain("command_submit_manual_deur");
    expect(migration).toContain("timeline_code");
    expect(migration).toContain("retryable'',false");
    expect(migration).toContain("refreshRequired'',false");
    expect(migration).not.toContain("command_submit_deur(jsonb)");
  });

  it("uses a forward-only definition replacement with no business-row writes", () => {
    expect(migration).toContain("definition:=replace(definition,old_branch,new_branch)");
    expect(migration).not.toMatch(/INSERT INTO erp\.(deurs|deur_events|audit_log)/);
    expect(migration).not.toMatch(/UPDATE erp\.(deurs|deur_events|audit_log)/);
  });
});
