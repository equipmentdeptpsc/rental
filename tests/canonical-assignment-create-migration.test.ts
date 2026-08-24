import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { SupabaseAssignmentCommandRepository } from "@/integrations/supabase/SupabaseAssignmentCommandRepository";

const filename = "20260823000100_canonical_assignment_create.sql";
const sql = fs.readFileSync(path.resolve("supabase/migrations", filename), "utf8");

describe("canonical Assignment create migration", () => {
  it("uses a new approved-lineage command with current authority helpers", () => {
    expect(filename).not.toMatch(/20260803007[7-9]00|20260803008[0-3]00/);
    expect(sql).toContain("CREATE FUNCTION erp.command_create_assignment(command jsonb)");
    expect(sql).toContain("erp.current_company_id()");
    expect(sql).toContain("erp.current_user_has_permission('assignment.manage')");
    expect(sql).toContain("'assignment.manage','Manage Assignments'");
    expect(sql).toContain("r.code='system-administrator' AND p.code='assignment.manage'");
    expect(sql).toContain("u.id=auth.uid() AND u.status='active'");
    expect(sql).not.toMatch(/tenant\s*=\s*command->>/);
  });

  it("validates canonical relationships, eligibility, dates, and fixed initial state", () => {
    for (const token of ["target_equipment.active", "target_equipment.deleted_at", "target_operator.status<>'Active'", "target_project.active", "target_activity", "expected_on<assigned_on", "'Active',actor,actor,tenant"]) expect(sql).toContain(token);
    expect(sql).toContain("coalesce(nullif(command->>'expectedReturn','')::date,assigned_on)");
    expect(sql).not.toMatch(/command->>'status'/);
  });

  it("locks contention records and retains database uniqueness as final protection", () => {
    expect(sql.match(/FOR UPDATE/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("uq_assignment_active_equipment");
    expect(sql).toContain("uq_assignment_active_operator");
    expect(sql).toContain("WHEN unique_violation");
    expect(sql).not.toContain("SQLERRM");
  });

  it("uses approved idempotency and one canonical audit event", () => {
    expect(sql).toContain("erp.begin_operational_command");
    expect(sql).toContain("erp.finish_operational_command");
    expect(sql).toContain("'IDEMPOTENCY_MISMATCH'");
    expect(sql).toContain("'ASSIGNMENT_CREATED'");
    expect(sql.match(/INSERT INTO erp\.audit_log/g)).toHaveLength(1);
  });

  it("keeps execution narrow and direct table writes denied", () => {
    expect(sql).toContain("SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog");
    expect(sql).toContain("FROM PUBLIC,anon,authenticated,service_role");
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain("REVOKE INSERT,UPDATE,DELETE ON erp.assignments FROM PUBLIC,anon,authenticated");
    expect(sql).not.toContain("GRANT INSERT");
  });
});

describe("canonical Assignment command adapter", () => {
  const projection = { id: "11111111-1111-4111-8111-111111111111", companyId: "tenant", equipmentId: "equipment", operatorId: "operator", projectId: "project", assignedDate: "2026-08-23", expectedReturn: "2026-08-23", remarks: "", status: "Active", createdAt: "2026-08-23T00:00:00Z", updatedAt: "2026-08-23T00:00:00Z", rowVersion: 1 };
  it("accepts canonical accepted and replayed projections", async () => {
    for (const disposition of ["ACCEPTED", "REPLAYED"] as const) {
      const rpc = vi.fn(async () => ({ data: { success: true, disposition, serverOccurredAt: projection.createdAt, refresh: [projection.id], value: projection }, error: null }));
      await expect(new SupabaseAssignmentCommandRepository({ schema: () => ({ rpc }) }).createAssignment({ commandId: "command", idempotencyKey: "key", assignmentId: projection.id, equipmentId: "equipment", operatorId: "operator", projectId: "project", assignedDate: "2026-08-23" })).resolves.toMatchObject({ success: true, disposition, value: projection });
    }
  });

  it("maps sparse database failures to safe browser messages", async () => {
    const rpc = vi.fn(async () => ({ data: { success: false, code: "EQUIPMENT_UNAVAILABLE" }, error: null }));
    await expect(new SupabaseAssignmentCommandRepository({ schema: () => ({ rpc }) }).createAssignment({ commandId: "command", idempotencyKey: "key", assignmentId: projection.id, equipmentId: "equipment", operatorId: "operator", projectId: "project", assignedDate: "2026-08-23" })).resolves.toMatchObject({ success: false, code: "EQUIPMENT_UNAVAILABLE", retryable: false });
  });

  it("accepts the canonical nullable Expected Return projection", async () => {
    const nullableProjection = { ...projection, expectedReturn: null };
    const rpc = vi.fn(async () => ({ data: { success: true, disposition: "ACCEPTED", serverOccurredAt: projection.createdAt, refresh: [projection.id], value: nullableProjection }, error: null }));
    await expect(new SupabaseAssignmentCommandRepository({ schema: () => ({ rpc }) }).createAssignment({ commandId: "command", idempotencyKey: "key", assignmentId: projection.id, equipmentId: "equipment", operatorId: "operator", projectId: "project", assignedDate: "2026-08-23" })).resolves.toMatchObject({ success: true, value: { expectedReturn: null } });
  });
});
