import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.resolve("supabase/migrations/20260729001600_phase_c4_legacy_command_tenant_fill.sql"),
  "utf8",
);

describe("Phase C4 legacy command tenant fill", () => {
  it("derives tenant only for legacy null inserts", () => {
    expect(sql).toContain("IF NEW.company_id IS NOT NULL THEN RETURN NEW");
    expect(sql).toContain("FROM rentals WHERE id=NEW.rental_id");
    expect(sql).toContain("FROM deurs WHERE id=NEW.deur_id");
    expect(sql).toContain("NEW.company_id=current_company_id()");
  });

  it("covers DEUR, event, and audit legacy command writes", () => {
    for (const table of ["deurs", "deur_events", "audit_log"]) {
      expect(sql).toContain(`BEFORE INSERT ON ${table}`);
    }
  });

  it("keeps the helper private and fails closed", () => {
    expect(sql).toContain("SECURITY DEFINER SET search_path=erp,auth");
    expect(sql).toContain("ERRCODE='23502'");
    expect(sql).toContain("FROM PUBLIC,anon,authenticated");
  });
});
