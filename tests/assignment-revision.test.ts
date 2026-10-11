import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const auth = vi.hoisted(() => ({ permissions: new Set(["assignment.read", "assignment.update"]) }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (code: string) => auth.permissions.has(code) }) }));
import { ApplicationDependencyProvider, createLocalApplicationDependencies, PersistenceMode, type ApplicationDependencies } from "@/app/composition";
import { repositorySuccess } from "@/core/persistence";
import AssignmentDetails from "@/pages/Assignments/Details";
import { SupabaseAssignmentCommandRepository } from "@/integrations/supabase/SupabaseAssignmentCommandRepository";

const sql = readFileSync("supabase/migrations/20261011000500_pre_rental_assignment_revision.sql", "utf8");
const assignment = { id: "a1", equipmentId: "e1", operatorId: "o1", projectId: "p1", assignedDate: "2026-10-20", expectedReturn: "2026-10-25", remarks: "Before", status: "Active" as const, rowVersion: 1 };
const roots: Root[] = [];
function deps(status: "Active" | "Completed" = "Active") {
  const base = createLocalApplicationDependencies();
  const page = (items: unknown[]) => ({ ...base.readRepositories.assignments, list: vi.fn(async () => repositorySuccess({ items, nextCursor: undefined })) });
  const reviseAssignment = vi.fn(async () => ({ success: true as const, disposition: "ACCEPTED" as const, serverOccurredAt: "2026-10-11T00:00:00Z", refresh: ["a1"], value: {} as never }));
  return { reviseAssignment, value: { ...base, readRepositories: { ...base.readRepositories, assignments: page([{ ...assignment, status }]), equipment: page([{ id: "e1", assetNo: "ME-1", equipmentName: "Excavator", active: true }]), operators: page([{ id: "o1", name: "Operator A", status: "Active" }, { id: "o2", name: "Operator B", status: "Active" }]), projects: page([{ id: "p1", name: "Project A", status: "Active" }, { id: "p2", name: "Project B", status: "Active" }]) }, commandRepositories: { ...base.commandRepositories, canonicalAssignment: { createAssignment: vi.fn(), cancelAssignment: vi.fn(), reviseAssignment } }, configuration: { ...base.configuration, persistenceMode: PersistenceMode.Remote } } as ApplicationDependencies };
}
async function render(dependencies: ApplicationDependencies) {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push(root);
  const route = createElement(Route, { path: "/assignments/:id", element: createElement(AssignmentDetails) });
  const routes = createElement(Routes, null, route);
  const router = createElement(MemoryRouter, { initialEntries: ["/assignments/a1"] }, routes);
  await act(async () => { root.render(createElement(ApplicationDependencyProvider, { dependencies }, router)); await Promise.resolve(); });
  return container;
}
afterEach(async () => { auth.permissions = new Set(["assignment.read", "assignment.update"]); while (roots.length) await act(async () => roots.pop()?.unmount()); });

describe("pre-Rental Assignment revision", () => {
  it("keeps tenant, permission, interval, lineage and audit enforcement in the canonical command", () => {
    for (const rule of ["current_company_id()", "'assignment.update'", "'assignment.operator.replace'", "DEPENDENCY_CONFLICT", "OPERATOR_ALREADY_ASSIGNED", "'ASSIGNMENT_REVISED'", "finish_operational_command"]) expect(sql).toContain(rule);
    expect(readFileSync("supabase/migrations/20261011000100_uat_operations_administrator_and_rental_line_assignment.sql", "utf8")).toContain("enforce_assignment_commitment_interval");
    expect(sql).not.toMatch(/UPDATE erp\.(rentals|deurs|billing_statements)/);
  });
  it("shows a populated authorized Edit / Revise form and calls only the canonical repository", async () => {
    const { value, reviseAssignment } = deps(); const container = await render(value);
    const edit = [...container.querySelectorAll("button")].find((button) => button.textContent === "Edit / Revise")!;
    await act(async () => { edit.click(); });
    expect((container.querySelector('input[type="date"]') as HTMLInputElement).value).toBe("2026-10-20");
    await act(async () => { (container.querySelector('form[aria-label="Revise Assignment"]') as HTMLFormElement).requestSubmit(); await Promise.resolve(); });
    expect(reviseAssignment).toHaveBeenCalledWith(expect.objectContaining({ assignmentId: "a1", expectedVersion: 1, operatorId: "o1", projectId: "p1", assignedDate: "2026-10-20", remarks: "Before" }));
  });
  it("explains lifecycle restrictions and denies edit without permission", async () => {
    const terminal = await render(deps("Completed").value);
    expect(terminal.textContent).toContain("Completed, cancelled, or linked activity cannot be changed retroactively.");
    expect(terminal.textContent).not.toContain("Edit / Revise");
    auth.permissions.clear(); const denied = await render(deps().value);
    expect(denied.textContent).not.toContain("Edit / Revise");
  });
  it("preserves specific conflict and dependency responses", async () => {
    const rpc = vi.fn(async () => ({ data: { success: false, code: "DEPENDENCY_CONFLICT" }, error: null }));
    const repository = new SupabaseAssignmentCommandRepository({ schema: () => ({ rpc }) });
    const command = { commandId: "c", idempotencyKey: "c", assignmentId: "a1", expectedVersion: 1, operatorId: "o1", projectId: "p1", assignedDate: "2026-10-20", remarks: "Before" };
    await expect(repository.reviseAssignment(command)).resolves.toMatchObject({ success: false, code: "DEPENDENCY_CONFLICT", refreshRequired: true });
    expect(rpc).toHaveBeenCalledWith("command_revise_assignment", { command });
  });
});
