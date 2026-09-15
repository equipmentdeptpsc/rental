import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260915000100_fix_deur_start_server_work_date.sql", "utf8");

describe("DEUR Start server work-date repair", () => {
  it("keeps the fixed-pilot override while using the canonical server date for non-pilot lines", () => {
    expect(migration).toContain("server_work_date=timezone(coalesce(nullif(snap#>>'{policy,timezone}',''),'UTC'),now_at)::date");
    expect(migration).toContain("effective_work_date=erp.resolve_uat_limited_pilot_work_date(line.id,server_work_date)");
    expect(migration).not.toContain("command->'draft'->>'workDate'");
    expect(migration).toContain("IF effective_work_date IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF");
  });

  it("restores the hardened Start Shift contract and preserves command protections", () => {
    for (const token of [
      "validate_deur_command_scope(command,'deur.create')",
      "DEUR_EXPECTATION_REQUIRED",
      "SNAPSHOT_STALE",
      "begin_deur_command(command,'START_SHIFT')",
      "IDEMPOTENCY_MISMATCH",
      "DUPLICATE_ACTIVE_DEUR",
      "FOR UPDATE",
      "commercial_snapshots",
      "INSERT INTO deur_events",
      "INSERT INTO audit_log",
      "'success',true,'disposition','ACCEPTED','record',to_jsonb(new_deur),'version',1,'serverOccurredAt',now_at",
    ]) expect(migration).toContain(token);
  });

  it("retains the exact authenticated command boundary", () => {
    expect(migration).toContain("RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth");
    expect(migration).toContain("REVOKE ALL ON FUNCTION erp.command_start_deur_shift(jsonb) FROM PUBLIC,anon,service_role");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.command_start_deur_shift(jsonb) TO authenticated");
  });
});
