import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ permissions: new Set(["operator.manage"]), addOperator: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (permission: string) => state.permissions.has(permission), user: undefined }) }));
vi.mock("@/features/operators/context/OperatorContext", () => ({ useOperator: () => ({ operators: [], addOperator: state.addOperator }) }));

import { ApplicationDependencyProvider, createLocalApplicationDependencies, PersistenceMode, type ApplicationDependencies } from "@/app/composition";
import { subscribeCanonicalOperatorRefresh } from "@/features/operators/remote/canonicalOperatorRefresh";
import { getOperatorRuntimeCapability } from "@/features/operators/services/operatorRuntimeCapability";
import { SupabaseOperatorCommandRepository } from "@/integrations/supabase/SupabaseOperatorCommandRepository";
import NewOperator from "@/pages/Operators/New";

const roots: Root[] = [];
const projection = { id: "canonical-operator", companyId: "tenant", name: "Canonical Operator", email: "operator@example.test", licenseNumber: "LIC-1", certificationType: "Forklift" as const, status: "Active" as const, joinedDate: "2026-08-23", deletedAt: null, createdAt: "2026-08-23T00:00:00Z", updatedAt: "2026-08-23T00:00:00Z", rowVersion: 1 };
function remoteDependencies(input: { enabled?: boolean; repository?: boolean; disposition?: "ACCEPTED" | "REPLAYED" } = {}) {
  const dependencies = createLocalApplicationDependencies();
  const createOperator = vi.fn(async (_command: unknown) => ({ success: true as const, disposition: input.disposition ?? "ACCEPTED" as const, serverOccurredAt: "2026-08-23T00:00:00Z", refresh: [projection.id], value: projection }));
  return { dependencies: { ...dependencies, commandRepositories: { ...dependencies.commandRepositories, ...(input.repository === false ? {} : { canonicalOperator: { createOperator } }) }, configuration: { ...dependencies.configuration, persistenceMode: PersistenceMode.Remote, remoteOperationalWritesEnabled: input.enabled ?? true } } as ApplicationDependencies, createOperator };
}
async function render(dependencies: ApplicationDependencies) {
  const container = document.createElement("div"); const root = createRoot(container); roots.push(root);
  const routes = createElement(Routes, null, createElement(Route, { path: "/operators/new", element: createElement(NewOperator) }), createElement(Route, { path: "/operators", element: createElement("div", null, "Canonical Operator destination") }));
  await act(async () => root.render(createElement(ApplicationDependencyProvider, { dependencies }, createElement(MemoryRouter, { initialEntries: ["/operators/new"] }, routes))));
  return container;
}
function field(container: HTMLElement, label: string) { const node = [...container.querySelectorAll("label")].find((candidate) => candidate.textContent?.trim().startsWith(label)); return container.querySelector(`[id="${node!.htmlFor}"]`) as HTMLInputElement | HTMLSelectElement; }
function setField(node: HTMLInputElement | HTMLSelectElement, value: string) { const prototype = node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event(node instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }
afterEach(async () => { state.permissions = new Set(["operator.manage"]); vi.clearAllMocks(); while (roots.length) await act(async () => roots.pop()?.unmount()); });

describe("canonical Operator remote create boundary", () => {
  it("fails closed without flag, repository, or effective permission", async () => {
    expect((await render(remoteDependencies({ enabled: false }).dependencies)).textContent).toContain("Operator changes");
    expect((await render(remoteDependencies({ repository: false }).dependencies)).textContent).toContain("Operator changes");
    state.permissions.clear(); expect((await render(remoteDependencies().dependencies)).textContent).toContain("Operator changes");
  });

  it("shows only the certified remote business-record fields", async () => {
    const container = await render(remoteDependencies().dependencies);
    for (const label of ["Name", "Email", "License Number", "Certification Type", "Joined Date"]) expect(field(container, label)).toBeTruthy();
    for (const text of ["Status", "Linked User", "Username", "Password", "PIN", "Confirm PIN", "Company"]) expect([...container.querySelectorAll("label")].some((label) => label.textContent?.includes(text))).toBe(false);
    expect([...field(container, "Certification Type").querySelectorAll("option")].map((option) => option.value)).toEqual(["None", "Heavy Machinery", "Forklift", "Crane Logistics"]);
  });

  it.each(["ACCEPTED", "REPLAYED"] as const)("treats %s as one successful canonical create", async (disposition) => {
    const { dependencies, createOperator } = remoteDependencies({ disposition }); const refreshed = vi.fn(); const unsubscribe = subscribeCanonicalOperatorRefresh(refreshed); const container = await render(dependencies);
    await act(async () => { setField(field(container, "Name"), " Canonical Operator "); setField(field(container, "Email"), " operator@example.test "); setField(field(container, "License Number"), " LIC-1 "); setField(field(container, "Certification Type"), "Forklift"); setField(field(container, "Joined Date"), "2026-08-23"); });
    await act(async () => { (container.querySelector("form") as HTMLFormElement).requestSubmit(); await Promise.resolve(); });
    expect(createOperator).toHaveBeenCalledTimes(1); const command = createOperator.mock.calls[0][0] as Record<string, unknown>;
    expect(command).toMatchObject({ name: "Canonical Operator", email: "operator@example.test", licenseNumber: "LIC-1", certificationType: "Forklift", joinedDate: "2026-08-23" }); expect(command.operatorId).toMatch(/^[0-9a-f-]{36}$/);
    for (const key of ["companyId", "status", "userId", "password", "pin", "linkedUser"]) expect(command).not.toHaveProperty(key);
    expect(refreshed).toHaveBeenCalledTimes(1); expect(container.textContent).toContain("Canonical Operator destination"); expect(state.addOperator).not.toHaveBeenCalled(); unsubscribe();
  });

  it("keeps a controlled failure on the form", async () => {
    const { dependencies } = remoteDependencies(); dependencies.commandRepositories.canonicalOperator = { createOperator: vi.fn(async () => ({ success: false as const, code: "PERSISTENCE_FAILURE" as const, message: "The remote service could not save the Operator. Refresh before retrying.", retryable: false, refreshRequired: true })) };
    const container = await render(dependencies); await act(async () => setField(field(container, "Name"), "Operator")); await act(async () => { (container.querySelector("form") as HTMLFormElement).requestSubmit(); await Promise.resolve(); });
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
