import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("canonical Assignment Activity Code requirement", () => {
  it("preserves the approved optional-on-create, amend-before-dependent-work contract", () => {
    const create = readFileSync("supabase/migrations/20260823000450_canonical_assignment_optional_expected_return.sql", "utf8");
    const amend = readFileSync("supabase/migrations/20260928000100_canonical_assignment_activity_code_amendment.sql", "utf8");
    const regression = readFileSync("supabase/migrations/20261008000200_preapproval_rental_preparation_revisions.sql", "utf8");
    const correction = readFileSync("supabase/migrations/20261013000100_restore_optional_assignment_activity_code.sql", "utf8");
    const form = readFileSync("src/features/assignment/components/RemoteAssignmentForm.tsx", "utf8");
    expect(create).toContain("IF nullif(btrim(command->>'activityCodeId'),'') IS NOT NULL THEN");
    expect(create).toContain("target_activity.id,assigned_on");
    expect(amend).toContain("command_amend_assignment_activity_code");
    expect(amend).toContain("target.activity_code_id IS NOT NULL");
    expect(regression).toContain("OR nullif(btrim(command->>'activityCodeId'),'') IS NULL");
    expect(correction).toContain("pg_get_functiondef('erp.command_create_assignment(jsonb)'::regprocedure)");
    expect(correction).toContain("EXECUTE replace(definition,required_guard,'')");
    expect(form).toContain("activityCodeId: form.activityCodeId || undefined");
  });
});
