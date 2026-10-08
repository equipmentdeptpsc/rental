import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ permissions: new Set(["rental.create"]) }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (permission: string) => authState.permissions.has(permission) }) }));

import { ApplicationDependencyProvider, createLocalApplicationDependencies, PersistenceMode, type ApplicationDependencies } from "@/app/composition";
import { repositoryFailure, repositorySuccess } from "@/core/persistence";
import { getAssignmentRuntimeCapability } from "@/features/assignment/services/assignmentRuntimeCapability";
import { subscribeCanonicalAssignmentRefresh } from "@/features/assignment/remote/canonicalAssignmentRefresh";
import Assignments from "@/pages/Assignments";
import AssignmentDetails from "@/pages/Assignments/Details";
import NewAssignment from "@/pages/Assignments/New";
import EditAssignment from "@/pages/Assignments/Edit";
import { SupabaseAssignmentCommandRepository } from "@/integrations/supabase/SupabaseAssignmentCommandRepository";
import { mapProject } from "@/integrations/supabase/readRepositories";
import { getProjectDisplayLabel } from "@/features/project/projectDisplay";

const roots: Root[] = [];
const page = (items: unknown[]) => repositorySuccess({ items, nextCursor: undefined });
const assignment = { id: "canonical-assignment", equipmentId: "canonical-equipment", operatorId: "canonical-operator", projectId: "canonical-project", assignedDate: "2026-08-23", expectedReturn: "2026-08-24", remarks: "Canonical", status: "Active" as const };

function remoteDependencies(input: { assignments?: unknown[]; equipment?: unknown[]; projects?: unknown[]; customers?: unknown[]; failure?: boolean; writesEnabled?: boolean; assignmentCreateEnabled?: boolean; assignmentRepository?: boolean } = {}): ApplicationDependencies {
  const local = createLocalApplicationDependencies();
  const failure = repositoryFailure("REMOTE_FAILED", "failed", { context: {}, recoverability: "RETRYABLE", recommendedAction: "Retry" });
  const repository = (items: unknown[]) => ({ ...local.readRepositories.assignments, list: vi.fn(async () => input.failure ? failure : page(items)) });
  return {
    ...local,
    repositories: { ...local.repositories, assignment: { ...local.repositories.assignment, getAll: () => [{ ...assignment, id: "local-only-assignment" }] }, equipmentStatusRead: { ...local.repositories.equipmentStatusRead, list: vi.fn(async () => repositorySuccess([{ id: "equipment-status-available", status: "Available", description: "Available", active: true, deleted: false }])) } },
    readRepositories: {
      ...local.readRepositories,
      assignments: repository(input.assignments ?? []),
      equipment: repository(input.equipment ?? [{ id: "canonical-equipment", assetNo: "ME-REMOTE", equipmentName: "Remote Equipment", statusId: "equipment-status-available", active: true }]),
      operators: repository([{ id: "canonical-operator", name: "Remote Operator", status: "Active" }]),
      projects: repository(input.projects ?? [{ id: "canonical-project", projectCode: "REMOTE", projectName: "Remote Project", customerId: "canonical-customer", location: "Remote location", projectManager: "", status: "Active" }]),
      customers: repository(input.customers ?? [{ id: "canonical-customer", companyName: "Remote Customer" }]),
    } as ApplicationDependencies["readRepositories"],
    commandRepositories: { ...local.commandRepositories, canonicalRental: { readReferenceData: vi.fn(async () => ({ success: true, value: { costCodes: [], activityCodes: [] } })) } as unknown as ApplicationDependencies["commandRepositories"]["canonicalRental"], ...((input.assignmentRepository ?? true) ? { canonicalAssignment: { createAssignment: vi.fn() } } : {}) },
    configuration: { ...local.configuration, persistenceMode: PersistenceMode.Remote, remoteOperationalWritesEnabled: input.writesEnabled ?? true, remoteAssignmentCreateEnabled: input.assignmentCreateEnabled ?? false },
  };
}

async function render(element: React.ReactNode, dependencies = remoteDependencies(), route = "/") {
  const container = document.createElement("div");
  const root = createRoot(container); roots.push(root);
  await act(async () => root.render(createElement(ApplicationDependencyProvider, { dependencies }, createElement(MemoryRouter, { initialEntries: [route] }, element))));
  return container;
}

afterEach(async () => { authState.permissions = new Set(["rental.create"]); while (roots.length) await act(async () => roots.pop()?.unmount()); });

describe("canonical Assignment remote UI boundary", () => {
  it("preserves and maps the canonical interval conflict", async () => {
    const repository = new SupabaseAssignmentCommandRepository({
      schema: () => ({ rpc: vi.fn(async () => ({ data: { success: false, code: "EQUIPMENT_INTERVAL_CONFLICT" }, error: null })) }),
    });
    await expect(repository.createAssignment({ commandId: "command-1", idempotencyKey: "command-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1", assignedDate: "2031-03-11", expectedReturn: "2031-03-11", remarks: "" })).resolves.toMatchObject({
      success: false,
      code: "EQUIPMENT_INTERVAL_CONFLICT",
      message: "This equipment is already committed for the requested interval.",
    });
  });

  it("keeps unrelated persistence failures on the generic fallback", async () => {
    const repository = new SupabaseAssignmentCommandRepository({
      schema: () => ({ rpc: vi.fn(async () => ({ data: { success: false, code: "PERSISTENCE_FAILURE" }, error: null })) }),
    });
    await expect(repository.createAssignment({ commandId: "command-2", idempotencyKey: "command-2", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1", assignedDate: "2031-03-11", expectedReturn: "2031-03-11", remarks: "" })).resolves.toMatchObject({
      success: false,
      code: "PERSISTENCE_FAILURE",
      message: "The remote service could not save the Assignment. Refresh before retrying.",
    });
  });
  it("keeps remote list empty when only a local Assignment exists", async () => {
    const container = await render(createElement(Assignments));
    expect(container.textContent).toContain("No assignments yet.");
    expect(container.textContent).not.toContain("local-only-assignment");
    expect(container.textContent).not.toContain("New Assignment");
  });

  it("renders canonical Assignment and deliberately adapted related records", async () => {
    const container = await render(createElement(Assignments), remoteDependencies({ assignments: [assignment] }));
    expect(container.textContent).toContain("ME-REMOTE");
    expect(container.textContent).toContain("Remote Equipment");
    expect(container.textContent).toContain("Remote Operator");
    expect(container.textContent).toContain("REMOTE - Remote Project");
    expect(container.querySelector('a[href="/assignments/canonical-assignment"]')).not.toBeNull();
  });

  it("keeps New Booking and the Assignment tab available beside the default Rental List", async () => {
    const container = await render(createElement(Assignments), remoteDependencies({ assignments: [assignment] }));
    expect(container.querySelector('a[href="/rentals/new"]')?.textContent).toContain("New Booking");
    const bookingTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((button) => button.textContent === "Rental Bookings");
    await act(async () => bookingTab?.click());
    expect(container.querySelector('[aria-label="Booking workspace views"] [aria-selected="true"]')?.textContent).toContain("List");
    const assignmentTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((button) => button.textContent === "Assignments");
    await act(async () => assignmentTab?.click());
    expect(container.querySelector('select[aria-label="Project"]')).not.toBeNull();
  });

  it("opens the equipment-centered assignment drawer from the row", async () => {
    const container = await render(createElement(Assignments), remoteDependencies({ assignments: [assignment] }));
    const row = container.querySelector('tr[aria-label="Open ME-REMOTE assignment"]');
    expect(row).not.toBeNull();
    await act(async () => row?.querySelector("td")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("ME-REMOTE");
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("REMOTE - Remote Project");
    expect(container.textContent).not.toContain("Timeline");
    expect(container.textContent).not.toContain("Kanban");
    expect(container.textContent).not.toContain("Calendar");
  });

  it("filters assignments by status using the existing read data", async () => {
    const container = await render(createElement(Assignments), remoteDependencies({ assignments: [assignment] }));
    const status = container.querySelector('select[aria-label="Status"]') as HTMLSelectElement;
    await act(async () => { status.value = "Completed"; status.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.textContent).toContain("No assignments match these filters.");
  });

  it("shows readable project options and keeps the selected label human-readable", async () => {
    const container = await render(createElement(Assignments), remoteDependencies({ assignments: [assignment] }));
    const project = container.querySelector('select[aria-label="Project"]') as HTMLSelectElement;
    const option = [...project.options].find((item) => item.value === "canonical-project");
    expect(option?.textContent).toBe("REMOTE - Remote Project");
    expect(option?.className).toContain("text-slate-900");
    await act(async () => { project.value = "canonical-project"; project.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(project.value).toBe("canonical-project");
    expect(project.selectedOptions[0].textContent).toBe("REMOTE - Remote Project");
    expect(container.textContent).toContain("project: REMOTE - Remote Project");
    expect(container.textContent).not.toContain("canonical-project");
    for (const name of ["Category", "Equipment", "Status", "Operator"]) expect(container.querySelector(`select[aria-label="${name}"]`)?.className).toContain("assignment-filter-select");
  });

  it("maps the actual remote Project read-model shape and uses one readable label", async () => {
    const mapped = mapProject({ id: "7e6a2b4f-10fd-4f4f-99b4-6eb845940123", project_code: "P-204", name: "Harbor Works", customer_id: "customer-a", location: "Pier 4", active: true, deleted_at: null });
    expect(mapped.success && mapped.value).toMatchObject({ projectCode: "P-204", projectName: "Harbor Works", customerId: "customer-a" });
    expect(mapped.success && getProjectDisplayLabel({ id: mapped.value!.id, projectCode: mapped.value!.projectCode, projectName: mapped.value!.projectName })).toBe("P-204 - Harbor Works");
    expect(getProjectDisplayLabel({ id: "7e6a2b4f-10fd-4f4f-99b4-6eb845940123" })).toBe("Project 7e6a2b");
  });

  it("keeps Customer + Project labels and options correctly linked", async () => {
    authState.permissions = new Set(["rental.create", "customer.read"]);
    const dependencies = remoteDependencies({ projects: [
      { id: "project-a", projectCode: "A", projectName: "Alpha", customerId: "customer-a", location: "", projectManager: "", status: "Active" },
      { id: "project-b", projectCode: "B", projectName: "Beta", customerId: "customer-b", location: "", projectManager: "", status: "Active" },
    ], customers: [
      { id: "customer-a", companyName: "Customer A" }, { id: "customer-b", companyName: "Customer B" },
    ] });
    const container = await render(createElement(Assignments), dependencies, "/?a_customer=customer-a&a_project=project-a");
    const project = container.querySelector('select[aria-label="Project"]') as HTMLSelectElement;
    expect([...project.options].map((option) => [option.value, option.textContent])).toContainEqual(["project-a", "A - Alpha"]);
    expect([...project.options].some((option) => option.value === "project-b")).toBe(false);
    expect(project.value).toBe("project-a");
    expect(container.textContent).toContain("project: A - Alpha");
    expect(container.textContent).not.toContain("project-a");
  });

  it("shows drawer actions only under the existing rental and cancellation gates", async () => {
    const noCancel = await render(createElement(Assignments), remoteDependencies({ assignments: [{ ...assignment, rowVersion: 1 }] }));
    await act(async () => noCancel.querySelector('tr[aria-label="Open ME-REMOTE assignment"] td')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(noCancel.querySelector('[role="dialog"]')?.textContent).toContain("Start Rental");
    expect(noCancel.querySelector('[role="dialog"]')?.textContent).not.toContain("Cancel Assignment");
    authState.permissions = new Set(["rental.create", "assignment.close"]);
    const enabled = remoteDependencies({ assignments: [{ ...assignment, rowVersion: 1 }] });
    enabled.configuration.remoteAssignmentCancelEnabled = true;
    const canCancel = await render(createElement(Assignments), enabled);
    await act(async () => canCancel.querySelector('tr[aria-label="Open ME-REMOTE assignment"] td')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(canCancel.querySelector('[role="dialog"]')?.textContent).toContain("Cancel Assignment");
  });

  it("keeps repository errors authoritative", async () => {
    const container = await render(createElement(Assignments), remoteDependencies({ failure: true }));
    expect(container.getAttribute("role") ?? container.querySelector('[role="alert"]')?.getAttribute("role")).toBe("alert");
    expect(container.textContent).toContain("Assignment data could not be loaded");
  });

  it("does not expose a local-only Assignment through remote details", async () => {
    const routes = createElement(Routes, null, createElement(Route, { path: "/assignments/:id", element: createElement(AssignmentDetails) }));
    const container = await render(routes, remoteDependencies(), "/assignments/local-only-assignment");
    expect(container.textContent).toBe("Assignment not found.");
  });

  it("offers Start Rental only from a canonical active Assignment", async () => {
    const routes = createElement(Routes, null, createElement(Route, { path: "/assignments/:id", element: createElement(AssignmentDetails) }));
    const container = await render(routes, remoteDependencies({ assignments: [assignment] }), "/assignments/canonical-assignment");
    expect(container.querySelector('a[href="/rentals/new?assignment=canonical-assignment"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Complete Assignment");
    expect(container.textContent).not.toContain("Cancel Assignment");
    expect(container.textContent).not.toContain("Edit Assignment");
  });

  it("fails closed on direct remote New and Edit routes", async () => {
    const newPage = await render(createElement(NewAssignment));
    expect(newPage.textContent).toContain("Assignment creation unavailable");
    const editPage = await render(createElement(EditAssignment));
    expect(editPage.textContent).toContain("Assignment editing unavailable");
  });

  it("enables canonical create only with permission, runtime flag, and repository", async () => {
    authState.permissions.add("assignment.create");
    const enabled = await render(createElement(NewAssignment));
    expect(enabled.textContent).toContain("Create a remote Assignment.");
    const flagDisabled = await render(createElement(NewAssignment), remoteDependencies({ writesEnabled: false }));
    expect(flagDisabled.textContent).toContain("Assignment creation unavailable");
    const createOnly = await render(createElement(NewAssignment), remoteDependencies({ writesEnabled: false, assignmentCreateEnabled: true }));
    expect(createOnly.textContent).toContain("Create a remote Assignment.");
    const repositoryMissing = await render(createElement(NewAssignment), remoteDependencies({ assignmentRepository: false }));
    expect(repositoryMissing.textContent).toContain("Assignment creation unavailable");
    authState.permissions.delete("assignment.create");
    const denied = await render(createElement(NewAssignment));
    expect(denied.textContent).toContain("Assignment creation unavailable");
  });

  it("submits canonical data, requests a canonical refresh, and navigates with the returned UUID", async () => {
    authState.permissions.add("assignment.create");
    const dependencies = remoteDependencies();
    const createdId = "11111111-1111-4111-8111-111111111111";
    const createAssignment = vi.fn(async () => ({ success: true as const, disposition: "ACCEPTED" as const, serverOccurredAt: "2026-08-23T00:00:00Z", refresh: [createdId], value: { ...assignment, id: createdId, companyId: "tenant", createdAt: "2026-08-23T00:00:00Z", updatedAt: "2026-08-23T00:00:00Z", rowVersion: 1 } }));
    dependencies.commandRepositories.canonicalAssignment = { createAssignment };
    const refreshed = vi.fn();
    const unsubscribe = subscribeCanonicalAssignmentRefresh(refreshed);
    const routes = createElement(Routes, null,
      createElement(Route, { path: "/assignments/new", element: createElement(NewAssignment) }),
      createElement(Route, { path: "/assignments/:id", element: createElement("div", null, "Canonical destination") }),
    );
    const container = await render(routes, dependencies, "/assignments/new");
    await act(async () => { await Promise.resolve(); });
    for (const label of ["Equipment", "Operator", "Project"]) {
      const labelNode = [...container.querySelectorAll("label")].find((node) => node.textContent === label)!;
      const input = [...container.querySelectorAll("input")].find((node) => node.id === labelNode.htmlFor) as HTMLInputElement;
      await act(async () => input.click());
      const choice = container.querySelector('button[role="option"]') as HTMLButtonElement;
      await act(async () => choice.click());
    }
    await act(async () => { (container.querySelector("form") as HTMLFormElement).requestSubmit(); await Promise.resolve(); });
    expect(createAssignment).toHaveBeenCalledWith(expect.objectContaining({ equipmentId: "canonical-equipment", operatorId: "canonical-operator", projectId: "canonical-project" }));
    expect((createAssignment.mock.calls as unknown[][])[0][0]).toHaveProperty("expectedReturn", undefined);
    expect(refreshed).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Canonical destination");
    unsubscribe();
  });

  it("keeps active and non-Available canonical Equipment selectable while excluding inactive or deleted rows", async () => {
    authState.permissions.add("assignment.create");
    const equipment = [
      { id: "assigned-equipment", assetNo: "D3-E1-20260908", equipmentName: "Existing Assignment", statusId: "status-assigned", active: true },
      { id: "maintenance-equipment", assetNo: "D3-E2-20260908", equipmentName: "Non-Available Status", statusId: "status-maintenance", active: true },
      { id: "inactive-equipment", assetNo: "D3-E3-20260908", equipmentName: "Inactive", statusId: "status-available", active: false },
      { id: "deleted-equipment", assetNo: "D3-E4-20260908", equipmentName: "Deleted", statusId: "status-available", active: true, deleted: true },
    ];
    const container = await render(createElement(NewAssignment), remoteDependencies({ assignments: [{ ...assignment, equipmentId: "assigned-equipment" }], equipment }), "/assignments/new");
    await act(async () => { await Promise.resolve(); });
    const equipmentInput = container.querySelector<HTMLInputElement>("input[role=combobox]")!;
    await act(async () => { equipmentInput.click(); });
    const options = [...container.querySelectorAll("[role=option]")].map((node) => node.textContent);
    expect(options).toEqual(expect.arrayContaining(["D3-E1-20260908 - Existing Assignment", "D3-E2-20260908 - Non-Available Status"]));
    expect(options).not.toEqual(expect.arrayContaining(["D3-E3-20260908 - Inactive", "D3-E4-20260908 - Deleted"]));
  });

  it("keeps Assigned Date required before invoking the canonical command", async () => {
    authState.permissions.add("assignment.create");
    const dependencies = remoteDependencies();
    const createAssignment = vi.fn();
    dependencies.commandRepositories.canonicalAssignment = { createAssignment };
    const container = await render(createElement(NewAssignment), dependencies, "/assignments/new");
    await act(async () => { await Promise.resolve(); });
    const assignedDate = [...container.querySelectorAll("input")].find((input) => input.type === "date" && input.required) as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(assignedDate, "");
      assignedDate.dispatchEvent(new Event("change", { bubbles: true }));
      (container.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(createAssignment).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Complete the required Assignment fields and enter valid dates.");
  });

  it("keeps controlled canonical command failures on the form", async () => {
    authState.permissions.add("assignment.create");
    const dependencies = remoteDependencies();
    dependencies.commandRepositories.canonicalAssignment = { createAssignment: vi.fn(async () => ({ success: false as const, code: "EQUIPMENT_INTERVAL_CONFLICT" as const, message: "This equipment is already committed for the requested interval.", retryable: false, refreshRequired: true })) };
    const container = await render(createElement(NewAssignment), dependencies, "/assignments/new");
    await act(async () => { await Promise.resolve(); });
    for (const label of ["Equipment", "Operator", "Project"]) {
      const labelNode = [...container.querySelectorAll("label")].find((node) => node.textContent === label)!;
      const input = [...container.querySelectorAll("input")].find((node) => node.id === labelNode.htmlFor) as HTMLInputElement;
      await act(async () => input.click());
      const choice = container.querySelector('button[role="option"]') as HTMLButtonElement;
      await act(async () => choice.click());
    }
    await act(async () => { (container.querySelector("form") as HTMLFormElement).requestSubmit(); await Promise.resolve(); });
    expect(container.textContent).toContain("This equipment is already committed for the requested interval.");
  });

  it("preserves local read and mutation capability", () => {
    const local = createLocalApplicationDependencies().configuration;
    expect(getAssignmentRuntimeCapability(local)).toMatchObject({ legacyReads: true, legacyMutations: true, canonicalReads: false });
    expect(getAssignmentRuntimeCapability({ ...local, persistenceMode: PersistenceMode.Remote, remoteOperationalWritesEnabled: true }, true)).toMatchObject({ legacyReads: false, legacyMutations: false, canonicalReads: true, canonicalMutations: true });
    expect(getAssignmentRuntimeCapability({ ...local, persistenceMode: PersistenceMode.Remote, remoteOperationalWritesEnabled: false, remoteAssignmentCreateEnabled: true }, true)).toMatchObject({ canonicalMutations: false, canonicalCreation: true });
    expect(getAssignmentRuntimeCapability({ ...local, persistenceMode: PersistenceMode.Remote, remoteOperationalWritesEnabled: false, remoteAssignmentCreateEnabled: false, remoteAssignmentCancelEnabled: false }, true)).toMatchObject({ canonicalCancellation: false, canonicalMutations: false });
    expect(getAssignmentRuntimeCapability({ ...local, persistenceMode: PersistenceMode.Remote, remoteOperationalWritesEnabled: false, remoteAssignmentCreateEnabled: false, remoteAssignmentCancelEnabled: true }, true)).toMatchObject({ canonicalCancellation: true, canonicalMutations: false, canonicalCreation: false });
});
});
