import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const p9=readFileSync("supabase/migrations/20260803007800_phase_p9_remote_assignment_creation.sql","utf8");
const canonical=readFileSync("supabase/migrations/20260823000100_canonical_assignment_create.sql","utf8");
const nullableExpectedReturn=readFileSync("supabase/migrations/20260823000450_canonical_assignment_optional_expected_return.sql","utf8");
const signature="FUNCTION erp.command_create_assignment(command jsonb) RETURNS jsonb";

describe("canonical Assignment migration replay chain",()=>{
  it("records the P9 definition and explicitly replaces it with the canonical successor",()=>{
    expect(p9).toMatch(/CREATE\s+FUNCTION\s+erp\.command_create_assignment\(command jsonb\)\s+RETURNS jsonb/);
    expect(canonical).toContain(`CREATE OR REPLACE ${signature}`);
    expect(canonical).not.toMatch(/CREATE\s+FUNCTION\s+erp\.command_create_assignment\(command jsonb\)/);
    expect(canonical).toContain("command->>'assignmentId' !~* '^[0-9a-f]{8}-");
    expect(canonical).toContain("GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME");
    expect(p9).not.toContain("GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME");
  });

  it("retains the optional-return migration as the authoritative final replacement",()=>{
    expect(nullableExpectedReturn).toContain(`CREATE OR REPLACE ${signature}`);
    expect(nullableExpectedReturn).toContain("expected_on=nullif(command->>'expectedReturn','')::date");
    expect(nullableExpectedReturn).toContain("IF expected_on IS NOT NULL AND expected_on<assigned_on");
    expect(nullableExpectedReturn).toContain("ALTER TABLE erp.assignments ALTER COLUMN expected_return DROP NOT NULL");
    expect(nullableExpectedReturn).not.toContain("expected_on=coalesce(nullif(command->>'expectedReturn','')::date,assigned_on)");
  });

  it("guards the collision point against regression to plain CREATE FUNCTION",()=>{
    const declarations=canonical.match(/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+erp\.command_create_assignment\(command jsonb\)/g)??[];
    expect(declarations).toEqual(["CREATE OR REPLACE FUNCTION erp.command_create_assignment(command jsonb)"]);
  });
});
