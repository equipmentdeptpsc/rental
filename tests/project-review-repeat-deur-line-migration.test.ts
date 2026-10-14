import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261014000100_project_review_multi_deur_line_membership.sql",
  "utf8",
);

describe("same-line Project review and DEUR work-date recovery", () => {
  it("iterates all effective DEURs for a business date and retains the empty-line placeholder", () => {
    expect(migration).toContain("LEFT JOIN LATERAL");
    expect(migration).toContain("candidate_target_id");
    expect(migration).toContain("AND d.superseded_by_revision_id IS NULL");
    expect(migration).toContain("d.work_date=requested_date");
    expect(migration).toContain("member_rental.timezone");
    expect(migration).toContain("total_count=total_count+1;\n    END LOOP;");
  });

  it("restores server-owned local work dates without changing the return-day exception", () => {
    expect(migration).toContain("IF scope->>''historicalReturnDay''=''true'' THEN");
    expect(migration).toContain("timezone(coalesce(nullif(snap#>>''{policy,timezone}'',''''),''UTC''),now_at)::date");
    expect(migration).toContain("resolve_uat_limited_pilot_work_date");
  });

  it("keeps authenticated command grants and default-execution revocations", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION erp.command_start_deur_shift(jsonb) FROM PUBLIC,anon,service_role");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.command_start_deur_shift(jsonb) TO authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.command_generate_customer_review_batch(jsonb) TO authenticated");
  });
});
