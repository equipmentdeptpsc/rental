import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SupabaseAssignmentCommandRepository } from "@/integrations/supabase/SupabaseAssignmentCommandRepository";

const migrationPath = path.resolve("supabase/migrations/20260803007800_phase_p9_remote_assignment_creation.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

describe("P9.2A Assignment command migration", () => {
  it("derives authority from the authenticated active application user", () => {
    expect(sql).toContain("id = auth.uid() AND status = 'active'");
    expect(sql).toContain("current_user_has_permission('assignment.manage')");
    expect(sql).toContain("company_id = tenant");
    expect(sql).not.toMatch(/tenant\s*:=\s*command->>/);
  });

  it("rejects caller authority and fixes initial status", () => {
    for (const key of ["companyId", "company_id", "tenantId", "actorId", "userId", "status", "permission"]) expect(sql).toContain(`'${key}'`);
    expect(sql).toContain("'Active',actor,actor,tenant");
    expect(sql).not.toMatch(/command->>'status'/);
  });

  it("validates and locks the canonical relationships", () => {
    expect(sql.match(/FOR UPDATE/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("pg_catalog.lower(s.code) = 'available'");
    expect(sql).toContain("target_operator.status <> 'Active'");
    expect(sql).toContain("NOT target_project.active");
    expect(sql).toContain("expected_on < assigned_on");
  });

  it("preserves exclusivity, Equipment transition, audit, and idempotency", () => {
    expect(sql).toContain("a.equipment_id=target_equipment.id AND a.status='Active'");
    expect(sql).toContain("a.operator_id=target_operator.id AND a.status='Active'");
    expect(sql).toContain("begin_operational_command");
    expect(sql).toContain("finish_operational_command");
    expect(sql).toContain("'IDEMPOTENCY_MISMATCH'");
    expect(sql).toContain("pg_catalog.lower(s.code)='assigned'");
    expect(sql).toContain("'ASSIGNMENT_CREATED'");
  });

  it("uses the established hardened RPC security model", () => {
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = erp, auth, pg_catalog");
    expect(sql).toContain("FROM PUBLIC, anon");
    expect(sql).toContain("TO authenticated");
    expect(sql).not.toContain("GRANT INSERT");
    expect(sql).not.toContain("GRANT UPDATE");
    expect(sql).not.toContain("SQLERRM");
  });

  it("is LF-only and leaves prior migration numbering intact", () => {
    expect(sql).not.toContain("\r\n");
    expect(path.basename(migrationPath)).toBe("20260803007800_phase_p9_remote_assignment_creation.sql");
  });
});

describe("P9.2A Supabase Assignment adapter", () => {
  const command = {
    commandId: "command-1", idempotencyKey: "assignment-key-1", assignmentId: "assignment-1",
    equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1",
    assignedDate: "2026-08-15", expectedReturn: "2026-08-16", remarks: "Day assignment",
  };
  const projection = {
    id: "assignment-1", companyId: "tenant-1", equipmentId: "equipment-1", operatorId: "operator-1",
    projectId: "project-1", assignedDate: "2026-08-15", expectedReturn: "2026-08-16",
    remarks: "Day assignment", status: "Active", createdAt: "2026-08-15T00:00:00Z",
    updatedAt: "2026-08-15T00:00:00Z", rowVersion: 1,
  };

  it("calls the authenticated ERP RPC and maps its canonical projection", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { success: true, disposition: "ACCEPTED", serverOccurredAt: projection.createdAt, refresh: [projection.id], value: projection }, error: null });
    const repository = new SupabaseAssignmentCommandRepository({ schema: vi.fn(() => ({ rpc })) });
    await expect(repository.createAssignment(command)).resolves.toMatchObject({ success: true, value: projection });
    expect(rpc).toHaveBeenCalledWith("command_create_assignment", { command });
  });

  it("preserves typed business failures and safe transport uncertainty", async () => {
    const denied = vi.fn().mockResolvedValue({ data: { success: false, code: "FORBIDDEN", message: "Assignment management permission is required.", retryable: false, refreshRequired: false }, error: null });
    await expect(new SupabaseAssignmentCommandRepository({ schema: () => ({ rpc: denied }) }).createAssignment(command)).resolves.toMatchObject({ success: false, code: "FORBIDDEN" });
    const unavailable = vi.fn().mockResolvedValue({ data: null, error: { message: "network unavailable" } });
    await expect(new SupabaseAssignmentCommandRepository({ schema: () => ({ rpc: unavailable }) }).createAssignment(command)).resolves.toMatchObject({ success: false, code: "TRANSPORT_FAILURE", retryable: true, refreshRequired: true });
  });
});
