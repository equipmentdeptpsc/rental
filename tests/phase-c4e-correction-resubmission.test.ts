import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve("supabase/migrations/20260729002500_phase_c4e_correction_resubmission.sql"),
  "utf8",
);

describe("Phase C4E corrected revision resubmission", () => {
  it("allows only complete correction revisions to submit from Draft", () => {
    expect(migration).toContain("current_deur.previous_revision_id IS NOT NULL");
    expect(migration).toContain("ev.source='correction'");
    expect(migration).toContain("ev.activity_type='shift' AND ev.action='end'");
    expect(migration).toContain("current_deur.status<>'In Progress' AND NOT corrected_complete");
    expect(migration).toContain("ev.is_open");
  });

  it("preserves authorization, tenancy, CAS, idempotency, and grants", () => {
    for (const token of [
      "validate_deur_command_scope(command,'deur.review')",
      "d.company_id=current_company_id()",
      "current_deur.row_version<>(command->>'expectedVersion')::bigint",
      "begin_deur_command(command,'SUBMIT_DEUR')",
      "finish_deur_command(command,'SUBMIT_DEUR'",
      "SECURITY DEFINER SET search_path=erp,auth",
      "REVOKE ALL ON FUNCTION command_submit_deur(jsonb) FROM PUBLIC,anon,service_role",
      "GRANT EXECUTE ON FUNCTION command_submit_deur(jsonb) TO authenticated",
    ]) expect(migration).toContain(token);
  });
});
