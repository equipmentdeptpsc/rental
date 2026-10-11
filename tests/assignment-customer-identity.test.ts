import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SupabaseAssignmentCommandRepository } from "@/integrations/supabase/SupabaseAssignmentCommandRepository";
import { resolveAssignmentRentalOrigin } from "@/features/rental/services/resolveAssignmentRentalOrigin";

const sql = readFileSync("supabase/migrations/20261011000600_assignment_customer_identity.sql", "utf8");
const form = readFileSync("src/features/assignment/components/RemoteAssignmentForm.tsx", "utf8");

describe("canonical Assignment Customer identity", () => {
  it("keeps historical Assignments intact and enforces tenant-scoped Customer/Project consistency", () => {
    for (const rule of ["ADD COLUMN customer_id text", "FOREIGN KEY(company_id,customer_id)", "project_customer", "c.company_id=tenant", "p.customer_id=c.id", "c.active", "p.active", "assignment.create", "command-'customerId'"]) expect(sql).toContain(rule);
    expect(sql).not.toMatch(/UPDATE erp\.(rentals|deurs|billing_statements)/);
  });
  it("submits an explicit Customer and limits the Project selector", () => {
    expect(form).toContain('label="Customer"');
    expect(form).toContain('item.customerId === form.customerId');
    expect(form).toContain('customerId: event.target.value, projectId: ""');
    expect(form).toContain('activeProjects.some((item) => item.id === form.projectId)');
  });
  it("preserves the selected Customer through the canonical RPC and Rental handoff", async () => {
    const rpc = vi.fn(async () => ({ data: { success: false, code: "CUSTOMER_PROJECT_MISMATCH" }, error: null }));
    const repository = new SupabaseAssignmentCommandRepository({ schema: () => ({ rpc }) });
    const command = { commandId: "c", idempotencyKey: "c", assignmentId: "a", equipmentId: "e", operatorId: "o", customerId: "c1", projectId: "p1", assignedDate: "2026-10-20" };
    await expect(repository.createAssignment(command)).resolves.toMatchObject({ success: false, code: "CUSTOMER_PROJECT_MISMATCH", message: "Select an active Customer and one of its Projects." });
    expect(rpc).toHaveBeenCalledWith("command_create_assignment_with_customer", { command });
    const project = { id: "p1", projectCode: "P1", projectName: "Project", projectManager: "", location: "", customerId: "c1", status: "Active" as const };
    const customer = { id: "c1", companyName: "Customer", customerCode: "C1", active: true };
    const assignment = { id: "a", equipmentId: "e", operatorId: "o", customerId: "c1", projectId: "p1", assignedDate: "2026-10-20", remarks: "", status: "Active" as const };
    expect(resolveAssignmentRentalOrigin(assignment, [project], [customer])).toMatchObject({ success: true, customer });
    expect(resolveAssignmentRentalOrigin({ ...assignment, customerId: "c2" }, [project], [customer])).toMatchObject({ success: false });
  });
});
