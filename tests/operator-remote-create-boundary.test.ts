import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ permissions: new Set(["operator.create"]), addOperator: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (permission: string) => state.permissions.has(permission), user: undefined }) }));
vi.mock("@/features/operators/context/OperatorContext", () => ({ useOperator: () => ({ operators: [], addOperator: state.addOperator }) }));

import { ApplicationDependencyProvider, createLocalApplicationDependencies, PersistenceMode, type ApplicationDependencies } from "@/app/composition";
import { repositorySuccess } from "@/core/persistence";
import { subscribeCanonicalOperatorRefresh } from "@/features/operators/remote/canonicalOperatorRefresh";
import { getOperatorRuntimeCapability } from "@/features/operators/services/operatorRuntimeCapability";
import { SupabaseOperatorCommandRepository } from "@/integrations/supabase/SupabaseOperatorCommandRepository";
import NewOperator from "@/pages/Operators/New";

const roots: Root[] = [];
const projection = { id: "canonical-operator", companyId: "tenant", name: "Canonical Operator", email: "operator@example.test", licenseNumber: "LIC-1", certificationType: "Forklift" as const, status: "Active" as const, joinedDate: "2026-08-23", deletedAt: null, createdAt: "2026-08-23T00:00:00Z", updatedAt: "2026-08-23T00:00:00Z", rowVersion: 1 };
function remoteDependencies(input: { operatorCreateEnabled?: boolean; operationalWritesEnabled?: boolean; repository?: boolean; disposition?: "ACCEPTED" | "REPLAYED" } = {}) {
  const dependencies = createLocalApplicationDependencies();
  const createOperator = vi.fn(async (_command: unknown) => ({ success: true as const, disposition: input.disposition ?? "ACCEPTED" as const, serverOccurredAt: "2026-08-23T00:00:00Z", refresh: [projection.id], value: projection }));
  const certificationTypes = ["Heavy Machinery", "Forklift", "Crane Logistics"].map((name, index) => ({ id: `certification-${index}`, name, active: true, usageCount: 0, createdAt: "2026-08-23T00:00:00Z", updatedAt: "2026-08-23T00:00:00Z", rowVersion: 1 }));
  const operatorCertifications = { listAssignableTypes: vi.fn(async () => repositorySuccess(certificationTypes)), listForOperator: vi.fn(async () => repositorySuccess([])), assign: vi.fn(async () => ({ success: true as const })), remove: vi.fn(async () => ({ success: true as const })) };
  return { dependencies: { ...dependencies, commandRepositories: { ...dependencies.commandRepositories, operatorCertifications, ...(input.repository === false ? {} : { canonicalOperator: { createOperator } }) }, configuration: { ...dependencies.configuration, persistenceMode: PersistenceMode.Remote, remoteOperationalWritesEnabled: input.operationalWritesEnabled ?? false, remoteOperatorCreateEnabled: input.operatorCreateEnabled ?? true } } as ApplicationDependencies, createOperator };
}
async function render(dependencies: ApplicationDependencies) {
  const container = document.createElement("div"); const root = createRoot(container); roots.push(root);
  const routes = createElement(Routes, null, createElement(Route, { path: "/operators/new", element: createElement(NewOperator) }), createElement(Route, { path: "/operators", element: createElement("div", null, "Canonical Operator destination") }));
  await act(async () => root.render(createElement(ApplicationDependencyProvider, { dependencies }, createElement(MemoryRouter, { initialEntries: ["/operators/new"] }, routes))));
  return container;
}
function field(container: HTMLElement, label: string) {
  const node = [...container.querySelectorAll("label")].find((candidate) => candidate.textContent?.trim() === label || candidate.textContent?.trim().startsWith(`${label} `));
  if (!node?.htmlFor) return null;
  return container.querySelector(`[id="${node.htmlFor}"]`) as HTMLInputElement | HTMLSelectElement | null;
}
function requiredField(container: HTMLElement, label: string) {
  const control = field(container, label);
  if (!control) throw new Error(`Expected an accessible control associated with label "${label}"`);
  return control;
}
async function selectCertification(container: HTMLElement, label: string) {
  const control = requiredField(container, "Add certification");
  await act(async () => { (control as HTMLElement).click(); await Promise.resolve(); });
  const option = [...container.querySelectorAll('[role="option"]')].find((candidate) => candidate.textContent?.trim() === label);
  if (!option) throw new Error(`Expected certification option "${label}"`);
  await act(async () => { (option as HTMLElement).click(); });
}
function setField(node: HTMLInputElement | HTMLSelectElement, value: string) { const prototype = node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event(node instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }
afterEach(async () => { state.permissions = new Set(["operator.create"]); vi.clearAllMocks(); while (roots.length) await act(async () => roots.pop()?.unmount()); });

describe("canonical Operator remote create boundary", () => {
  it("fails closed without flag, repository, or effective permission", async () => {
    expect((await render(remoteDependencies({ operatorCreateEnabled: false }).dependencies)).textContent).toContain("Operator changes");
    expect((await render(remoteDependencies({ repository: false }).dependencies)).textContent).toContain("Operator changes");
    state.permissions.clear(); expect((await render(remoteDependencies().dependencies)).textContent).toContain("Operator changes");
  });

  it("shows only the certified remote business-record fields", async () => {
    const container = await render(remoteDependencies().dependencies);
    for (const label of ["Name", "Email", "License Number", "Add certification", "Joined Date"]) expect(field(container, label)).toBeTruthy();
    for (const text of ["Status", "Linked User", "Username", "Password", "PIN", "Confirm PIN", "Company"]) expect([...container.querySelectorAll("label")].some((label) => label.textContent?.includes(text))).toBe(false);
    expect(field(container, "Add certification")?.getAttribute("role")).toBe("combobox");
    expect(container.querySelector("fieldset legend")?.textContent).toBe("Certifications");
  });

  it.each(["ACCEPTED", "REPLAYED"] as const)("treats %s as one successful canonical create", async (disposition) => {
    const { dependencies, createOperator } = remoteDependencies({ disposition }); const refreshed = vi.fn(); const unsubscribe = subscribeCanonicalOperatorRefresh(refreshed); const container = await render(dependencies);
    await act(async () => { setField(requiredField(container, "Name"), " Canonical Operator "); setField(requiredField(container, "Email"), " operator@example.test "); setField(requiredField(container, "License Number"), " LIC-1 "); setField(requiredField(container, "Joined Date"), "2026-08-23"); });
    await selectCertification(container, "Forklift");
    await act(async () => { (container.querySelector("form") as HTMLFormElement).requestSubmit(); await Promise.resolve(); });
    expect(createOperator).toHaveBeenCalledTimes(1); const command = createOperator.mock.calls[0][0] as Record<string, unknown>;
    expect(command).toMatchObject({ name: "Canonical Operator", email: "operator@example.test", licenseNumber: "LIC-1", certificationType: "Forklift", joinedDate: "2026-08-23" }); expect(command.operatorId).toMatch(/^[0-9a-f-]{36}$/);
    for (const key of ["companyId", "status", "userId", "password", "pin", "linkedUser"]) expect(command).not.toHaveProperty(key);
    expect(refreshed).toHaveBeenCalledTimes(1); expect(container.textContent).toContain("Canonical Operator destination"); expect(state.addOperator).not.toHaveBeenCalled(); unsubscribe();
  });

  it("keeps a controlled failure on the form", async () => {
    const { dependencies } = remoteDependencies(); dependencies.commandRepositories.canonicalOperator = { createOperator: vi.fn(async () => ({ success: false as const, code: "PERSISTENCE_FAILURE" as const, message: "The remote service could not save the Operator. Refresh before retrying.", retryable: false, refreshRequired: true })) };
    const container = await render(dependencies); await act(async () => setField(requiredField(container, "Name"), "Operator")); await act(async () => { (container.querySelector("form") as HTMLFormElement).requestSubmit(); await Promise.resolve(); });
    expect(container.textContent).toContain("The remote service could not save the Operator"); expect(container.textContent).not.toMatch(/postgres|sqlstate|constraint/i); expect(state.addOperator).not.toHaveBeenCalled();
  });

  it("reports transport failures without exposing Supabase details", async () => {
    const repository = new SupabaseOperatorCommandRepository({ schema: () => ({ rpc: async () => ({ data: null, error: { message: "duplicate key violates operators_pkey SQLSTATE 23505" } }) }) });
    const result = await repository.createOperator({ commandId: "c", idempotencyKey: "i", operatorId: crypto.randomUUID(), name: "Operator" });
    expect(result).toMatchObject({ success: false, code: "TRANSPORT_FAILURE" }); if (!result.success) expect(result.message).not.toMatch(/duplicate|sqlstate|operators_pkey/i);
  });

  it("keeps local capability behavior unchanged", () => {
    const local = createLocalApplicationDependencies().configuration; expect(getOperatorRuntimeCapability(local, true)).toMatchObject({ legacyReads: true, legacyMutations: true, canonicalReads: false, canonicalMutations: false });
  });
});
