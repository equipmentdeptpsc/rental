import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.resolve("supabase/migrations/20260729001700_phase_c4_deur_idempotency_tenant_fill.sql"),
  "utf8",
);

describe("Phase C4 DEUR idempotency tenant fill", () => {
  it("derives the actor company for only missing legacy scope", () => {
    expect(sql).toContain("TG_TABLE_NAME='deur_command_idempotency'");
    expect(sql).toContain("FROM users WHERE id=NEW.actor_id AND status='active'");
    expect(sql).toContain("IF NEW.company_id IS NOT NULL THEN RETURN NEW");
  });

  it("keeps the compatibility helper private and fail-closed", () => {
    expect(sql).toContain("SECURITY DEFINER SET search_path=erp,auth");
    expect(sql).toContain("ERRCODE='23502'");
    expect(sql).toContain("FROM PUBLIC,anon,authenticated");
  });
});
