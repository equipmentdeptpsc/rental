import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getOperationalRefreshPlan } from "@/features/rental/operations/commands/refreshPlan";
import { createApplicationDependencies } from "@/app/composition/createApplicationDependencies";

const migrationPath = path.resolve("supabase/migrations/20260729000400_phase_c2h_command_hardening.sql");
const hardening = fs.readFileSync(migrationPath, "utf8");
const c2 = [
  "supabase/migrations/20260729000200_phase_c2_tenant_operational_commands.sql",
  "supabase/migrations/20260729000300_phase_c2_mutation_functions.sql",
].map((file) => fs.readFileSync(path.resolve(file), "utf8")).join("\n");
const pgcryptoForwardFix = fs.readFileSync(
  path.resolve("supabase/migrations/20260729000500_phase_c2h_pgcrypto_resolution.sql"),
  "utf8",
);

describe("Phase C2H database hardening", () => {
  it("removes permissive RLS policies that would OR around tenant scope", () => {
    expect(hardening).toContain("DROP POLICY IF EXISTS users_authenticated_read ON users");
    expect(hardening).toContain("table_name||'_authenticated_read'");
    expect(hardening).toContain("company_id=current_company_id()");
  });

  it("defines and validates same-company relationships", () => {
    for (const relationship of [
      "fk_users_company_operator", "fk_assignments_company_equipment",
      "fk_rentals_company_customer", "fk_lines_company_rental",
      "fk_lines_company_operator", "fk_deurs_company_line",
      "fk_deurs_company_previous_revision",
    ]) {
      expect(hardening).toContain(`CONSTRAINT ${relationship}`);
      expect(hardening).toContain(`VALIDATE CONSTRAINT ${relationship}`);
    }
    expect(hardening).toContain("reject_cross_company_child");
    expect(hardening).toContain("tenant relationship mismatch");
  });

  it("stores tenant/actor/payload-bound results without raw public tokens", () => {
    expect(hardening).toContain("CREATE TABLE operational_command_idempotency");
    expect(hardening).toContain("UNIQUE(company_id,actor_key,idempotency_key)");
    expect(hardening).toContain("command-'commandId'-'idempotencyKey'-'token'");
    expect(c2).toContain("begin_operational_command");
    expect(c2).toContain("finish_operational_command");
    expect(c2).toContain("response #- '{value,rawToken}'");
  });

  it("schema-qualifies pgcrypto without broadening security-definer search paths", () => {
    const unapplied = `${c2}\n${hardening}\n${pgcryptoForwardFix}`;
    expect(unapplied).not.toMatch(/(?<![.\w])digest\s*\(/);
    expect(unapplied).not.toMatch(/(?<![.\w])gen_random_bytes\s*\(/);
    expect(unapplied).toContain("extensions.digest");
    expect(unapplied).toContain("extensions.gen_random_bytes");
    expect(unapplied).toContain("SET search_path=erp,public");
    expect(unapplied).not.toMatch(/SET search_path\s*=[^;\n]*extensions/i);
    expect(pgcryptoForwardFix).toContain("CREATE OR REPLACE FUNCTION begin_deur_command");
  });

  it("keeps public token hashing deterministic and raw tokens out of persistence", () => {
    expect(c2).toContain("extensions.digest(raw_token,'sha256')");
    expect(c2).toContain("extensions.digest(command->>'token','sha256')");
    expect(c2).not.toMatch(/INSERT INTO customer_review_requests[\\s\\S]*?raw_token[\\s\\S]*?VALUES/i);
    expect(c2).toContain("response #- '{value,rawToken}'");
  });

  it("uses frozen permission keys", () => {
    expect(c2).toContain("current_user_has_permission('deur.correct')");
    expect(c2).toContain("current_user_has_permission('rental.return')");
    expect(c2).toContain("current_user_has_permission('rental.manage')");
    expect(c2).not.toContain("current_user_has_permission('rental.update')");
  });

  it("marks and reports the compatibility tenant", () => {
    expect(hardening).toContain("environment_class='compatibility'");
    expect(hardening).toContain("compatibility_tenant_report");
    expect(hardening).toContain("cross_tenant_mismatch_count");
  });

  it("scopes DEUR sequences by company", () => {
    expect(hardening).toContain("ON CONFLICT(company_id,scope,sequence_year)");
    expect(hardening).toContain("tenant text=current_company_id()");
  });
});

describe("Phase C2H composition and refresh", () => {
  it("defaults Remote operational writes off without falling back to Local writes", async () => {
    const dependencies = createApplicationDependencies({
      persistenceMode: "remote",
      equipmentStatusSource: "supabase",
      supabaseUrl: "https://phase-c2-test.supabase.co",
      supabasePublishableKey: "test-publishable-key",
    });
    expect(dependencies.configuration).toMatchObject({ persistenceMode: "remote", remoteOperationalWritesEnabled: false });
    await expect(dependencies.commandRepositories.rentalReturnCommands.returnAll({
      commandId: "command-1", idempotencyKey: "key-1", rentalId: "rental-1",
    })).resolves.toMatchObject({ success: false, code: "NOT_ENABLED" });
  });

  it("defines selective, operation-specific refresh plans", () => {
    expect(getOperationalRefreshPlan("createReview")).toEqual(["review-request", "deur", "rental-line"]);
    expect(getOperationalRefreshPlan("returnLine")).toEqual(["rental-line", "equipment", "assignment", "rental", "closure-readiness"]);
    expect(getOperationalRefreshPlan("close")).toEqual(["rental", "rental-line", "closure-readiness", "audit"]);
    expect(getOperationalRefreshPlan("meter")).not.toContain("equipment");
  });
});
