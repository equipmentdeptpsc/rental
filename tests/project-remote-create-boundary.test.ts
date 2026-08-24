import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ permissions: new Set(["project.manage"]), addProject: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (permission: string) => state.permissions.has(permission) }) }));
vi.mock("@/features/project/context/ProjectContext", () => ({ useProject: () => ({ projects: [], addProject: state.addProject }) }));
vi.mock("@/features/customer/context/CustomerContext", () => ({ useCustomer: () => ({ customers: [] }) }));

import { ApplicationDependencyProvider, createLocalApplicationDependencies, PersistenceMode, type ApplicationDependencies } from "@/app/composition";
import { subscribeCanonicalProjectRefresh } from "@/features/project/remote/canonicalProjectRefresh";
import NewProject from "@/pages/Projects/New";

const roots: Root[] = [];
function remoteDependencies(input: { enabled?: boolean; repository?: boolean } = {}) {
  const dependencies = createLocalApplicationDependencies();
  const createProject = vi.fn(async (_command: unknown) => ({ success: true as const, disposition: "ACCEPTED" as const, serverOccurredAt: "2026-08-23T00:00:00Z", refresh: ["canonical-project"], value: { id: "canonical-project", companyId: "tenant", projectCode: "PROJECT-001", name: "Canonical Project", customerId: null, location: "Site", active: true as const, deletedAt: null, createdAt: "2026-08-23T00:00:00Z", updatedAt: "2026-08-23T00:00:00Z", rowVersion: 1 } }));
  return { dependencies: { ...dependencies, commandRepositories: { ...dependencies.commandRepositories, ...(input.repository === false ? {} : { canonicalProject: { createProject } }) }, configuration: { ...dependencies.configuration, persistenceMode: PersistenceMode.Remote, remoteOperationalWritesEnabled: input.enabled ?? true } } as ApplicationDependencies, createProject };
}
async function render(dependencies: ApplicationDependencies) {
  const container = document.createElement("div"); const root = createRoot(container); roots.push(root);
  const routes = createElement(Routes, null, createElement(Route, { path: "/projects/new", element: createElement(NewProject) }), createElement(Route, { path: "/projects", element: createElement("div", null, "Canonical Project destination") }));
  await act(async () => root.render(createElement(ApplicationDependencyProvider, { dependencies }, createElement(MemoryRouter, { initialEntries: ["/projects/new"] }, routes))));
  return container;
}
function input(container: HTMLElement, label: string) {
  const node = [...container.querySelectorAll("label")].find((candidate) => candidate.textContent?.trim().startsWith(label));
  return container.querySelector(`[id="${node!.htmlFor}"]`) as HTMLInputElement;
}
function setInput(node: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value);
  node.dispatchEvent(new Event("input", { bubbles: true }));
}
function setSelect(node: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(node, value);
  node.dispatchEvent(new Event("change", { bubbles: true }));
}
afterEach(async () => { state.permissions = new Set(["project.manage"]); vi.clearAllMocks(); while (roots.length) await act(async () => roots.pop()?.unmount()); });

describe("canonical Project remote create boundary", () => {
  it("fails closed without flag, repository, or permission", async () => {
    expect((await render(remoteDependencies({ enabled: false }).dependencies)).textContent).toContain("Project changes are unavailable");
    expect((await render(remoteDependencies({ repository: false }).dependencies)).textContent).toContain("Project changes are unavailable");
    state.permissions.clear();
    expect((await render(remoteDependencies().dependencies)).textContent).toContain("Project changes are unavailable");
  });

  it("submits only canonical Project inputs and refreshes canonical reads", async () => {
    const { dependencies, createProject } = remoteDependencies();
    dependencies.readRepositories.customers.list = vi.fn(async () => ({ success: true as const, value: { items: [{ id: "fd753935-f65c-456b-ad54-55265dc3223d", customerCode: "UAT-CUS-001", companyName: "UAT Equipment Rental Customer", active: true }], nextCursor: undefined } }));
    const refreshed = vi.fn(); const unsubscribe = subscribeCanonicalProjectRefresh(refreshed);
    const container = await render(dependencies);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { setInput(input(container, "Project Code"), " PROJECT-001 "); setInput(input(container, "Project Name"), " Canonical Project "); setSelect(input(container, "Customer") as unknown as HTMLSelectElement, "fd753935-f65c-456b-ad54-55265dc3223d"); setInput(input(container, "Location"), " Site "); });
    await act(async () => { (container.querySelector("form") as HTMLFormElement).requestSubmit(); await Promise.resolve(); });
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(createProject).toHaveBeenCalledWith(expect.objectContaining({ projectCode: "PROJECT-001", name: "Canonical Project", customerId: "fd753935-f65c-456b-ad54-55265dc3223d", location: "Site" }));
    expect(createProject.mock.calls[0][0].location).not.toContain("UAT-CUS-001");
    for (const field of ["companyId", "active", "status", "projectManager", "client", "legacyPayload"]) expect(createProject.mock.calls[0][0]).not.toHaveProperty(field);
    expect(state.addProject).not.toHaveBeenCalled(); expect(refreshed).toHaveBeenCalledTimes(1); expect(container.textContent).toContain("Canonical Project destination");
    unsubscribe();
  });

  it("omits Customer and location when both optional fields are blank", async () => {
    const { dependencies, createProject } = remoteDependencies();
    dependencies.readRepositories.customers.list = vi.fn(async () => ({ success: true as const, value: { items: [], nextCursor: undefined } }));
    const container = await render(dependencies);
    await act(async () => { setInput(input(container, "Project Code"), "PROJECT-002"); setInput(input(container, "Project Name"), "No Customer Project"); });
    await act(async () => { (container.querySelector("form") as HTMLFormElement).requestSubmit(); await Promise.resolve(); });
    expect(createProject.mock.calls[0][0]).not.toHaveProperty("customerId");
    expect(createProject.mock.calls[0][0]).not.toHaveProperty("location");
  });

  it("reuses one command identity while a controlled failure remains on the form", async () => {
    const { dependencies } = remoteDependencies();
    const createProject = vi.fn(async (_command: unknown) => ({ success: false as const, code: "PROJECT_CODE_CONFLICT" as const, message: "Project code already exists.", retryable: false, refreshRequired: true }));
    dependencies.commandRepositories.canonicalProject = { createProject };
    const container = await render(dependencies);
    await act(async () => { setInput(input(container, "Project Code"), "PROJECT-001"); setInput(input(container, "Project Name"), "Canonical Project"); });
    await act(async () => { (container.querySelector("form") as HTMLFormElement).requestSubmit(); await Promise.resolve(); });
    expect(container.textContent).toContain("Project code already exists.");
    expect(createProject).toHaveBeenCalledTimes(1);
  });
});
