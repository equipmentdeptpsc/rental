import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ permissions: new Set<string>(["operator.create"]) }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (permission: string) => authState.permissions.has(permission) }) }));

import { ApplicationDependencyProvider, createApplicationDependencies, createLocalApplicationDependencies, PersistenceMode, type ApplicationDependencies } from "@/app/composition";
import { repositorySuccess } from "@/core/persistence";
import { getAssignmentRuntimeCapability } from "@/features/assignment/services/assignmentRuntimeCapability";
import { getEquipmentRuntimeCapability } from "@/features/equipment/services/equipmentRuntimeCapability";
import { getOperatorRuntimeCapability } from "@/features/operators/services/operatorRuntimeCapability";
import { canUseCanonicalRemoteRentalCreation } from "@/features/rental/services/rentalRuntimeCapability";
import { SupabaseOperatorCommandRepository } from "@/integrations/supabase/SupabaseOperatorCommandRepository";
import EditOperator from "@/pages/Operators/Edit";
import OperatorsPage from "@/pages/Operators";
import NewOperator from "@/pages/Operators/New";

const roots: Root[] = [];

function remoteDependencies(input: { operatorCreateEnabled?: boolean; operationalWritesEnabled?: boolean; repositoryAvailable?: boolean } = {}): ApplicationDependencies {
  const local = createLocalApplicationDependencies();
  return {
    ...local,
    readRepositories: {
      ...local.readRepositories,
      operators: { list: vi.fn(async () => repositorySuccess({ items: [{ id: "operator-1", name: "Existing Operator", status: "Active", deletedAt: null }] })) },
      users: { list: vi.fn(async () => repositorySuccess({ items: [] })) },
      assignments: { list: vi.fn(async () => repositorySuccess({ items: [] })) },
    } as ApplicationDependencies["readRepositories"],
    commandRepositories: {
      ...local.commandRepositories,
      ...(input.repositoryAvailable === false ? {} : { canonicalOperator: { createOperator: vi.fn() } }),
    },
    configuration: {
      ...local.configuration,
      persistenceMode: PersistenceMode.Remote,
      remoteOperationalWritesEnabled: input.operationalWritesEnabled ?? false,
      remoteOperatorCreateEnabled: input.operatorCreateEnabled ?? false,
    },
  } as ApplicationDependencies;
}

async function render(dependencies: ApplicationDependencies, page = createElement(NewOperator)) {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(createElement(ApplicationDependencyProvider, { dependencies }, createElement(MemoryRouter, null, page))));
  return container;
}

afterEach(async () => {
  authState.permissions = new Set(["operator.create"]);
  while (roots.length) await act(async () => roots.pop()?.unmount());
});

describe("narrow canonical Operator-create capability", () => {
  it("enables only canonical creation with the narrow flag and repository while broad writes stay disabled", () => {
    const configuration = remoteDependencies({ operatorCreateEnabled: true }).configuration;
    expect(getOperatorRuntimeCapability(configuration, true)).toMatchObject({ canonicalCreation: true, canonicalMutations: false, legacyMutations: false });
    expect(getOperatorRuntimeCapability({ ...configuration, remoteOperatorCreateEnabled: false }, true)).toMatchObject({ canonicalCreation: false, canonicalMutations: false });
    expect(getOperatorRuntimeCapability(configuration, false)).toMatchObject({ canonicalCreation: false, canonicalMutations: false });
  });

  it("requires the narrow flag, repository, and operator.create permission at the normal create route", async () => {
    const enabled = await render(remoteDependencies({ operatorCreateEnabled: true }));
    expect(enabled.textContent).toContain("Create a remote Operator business record.");

    const disabled = await render(remoteDependencies({ operatorCreateEnabled: false }));
    expect(disabled.textContent).toContain("Operator changes, linked-user changes, and PIN changes are currently unavailable.");

    const repositoryMissing = await render(remoteDependencies({ operatorCreateEnabled: true, repositoryAvailable: false }));
    expect(repositoryMissing.textContent).toContain("Operator changes, linked-user changes, and PIN changes are currently unavailable.");

    authState.permissions.delete("operator.create");
    const denied = await render(remoteDependencies({ operatorCreateEnabled: true }));
    expect(denied.textContent).toContain("Operator changes, linked-user changes, and PIN changes are currently unavailable.");
  });

  it("shows create but hides Edit links when only narrow Operator creation is enabled", async () => {
    const page = await render(remoteDependencies({ operatorCreateEnabled: true }), createElement(OperatorsPage));
    expect(page.textContent).toContain("New Operator");
    expect(page.textContent).toContain("Read-only view");
    expect(page.textContent).not.toContain("Edit");
    expect(page.querySelector('a[href="/operators/edit/operator-1"]')).toBeNull();
  });

  it("preserves Edit links when the existing broad Operator mutation gate is enabled", async () => {
    authState.permissions.add("operator.update");
    const page = await render(remoteDependencies({ operatorCreateEnabled: true, operationalWritesEnabled: true }), createElement(OperatorsPage));
    expect(page.textContent).toContain("New Operator");
    expect(page.querySelector('a[href="/operators/edit/operator-1"]')).not.toBeNull();
  });

  it("keeps the direct Operator edit route unavailable in create-only mode", async () => {
    const page = await render(remoteDependencies({ operatorCreateEnabled: true }), createElement(EditOperator));
    expect(page.textContent).toContain("Edit Operator");
    expect(page.textContent).toContain("currently unavailable");
  });

  it("does not broaden Assignment, Rental, Equipment, or general Operator mutations", () => {
    const configuration = remoteDependencies({ operatorCreateEnabled: true }).configuration;
    expect(getOperatorRuntimeCapability(configuration, true).canonicalMutations).toBe(false);
    expect(getAssignmentRuntimeCapability(configuration, false).canonicalCreation).toBe(false);
    expect(canUseCanonicalRemoteRentalCreation(configuration)).toBe(false);
    expect(getEquipmentRuntimeCapability(configuration, false).canonicalCreate).toBe(false);
  });

  it("keeps the canonical Operator RPC command and response contract unchanged", async () => {
    const rpc = vi.fn(async () => ({ data: { success: true, disposition: "ACCEPTED", serverOccurredAt: "2026-09-12T00:00:00Z", refresh: ["11111111-1111-4111-8111-111111111111"], value: { id: "11111111-1111-4111-8111-111111111111", companyId: "tenant", name: "Operator", email: null, licenseNumber: null, certificationType: "None", status: "Active", joinedDate: null, deletedAt: null, createdAt: "2026-09-12T00:00:00Z", updatedAt: "2026-09-12T00:00:00Z", rowVersion: 1 } }, error: null }));
    const repository = new SupabaseOperatorCommandRepository({ schema: () => ({ rpc }) });
    await expect(repository.createOperator({ operatorId: "11111111-1111-4111-8111-111111111111", commandId: "command", idempotencyKey: "command", name: "Operator", certificationType: "None" })).resolves.toMatchObject({ success: true, value: { name: "Operator", status: "Active" } });
    expect(rpc).toHaveBeenCalledWith("command_create_operator", expect.any(Object));
  });

  it("wires the narrow flag to the Operator repository without wiring unrelated canonical command repositories", () => {
    const dependencies = createApplicationDependencies({ persistenceMode: PersistenceMode.Remote, equipmentStatusSource: "supabase", supabaseUrl: "https://jtkctarqbwmqdcewthkn.supabase.co", supabasePublishableKey: "browser-safe-test-key", remoteOperationalWritesEnabled: false, remoteOperatorCreateEnabled: true });
    expect(dependencies.commandRepositories.canonicalOperator).toBeDefined();
    expect(dependencies.commandRepositories.canonicalAssignment).toBeUndefined();
    expect(dependencies.commandRepositories.canonicalEquipment).toBeUndefined();
    expect(dependencies.commandRepositories.canonicalCustomer).toBeUndefined();
    expect(dependencies.configuration.remoteOperationalWritesEnabled).toBe(false);
  });
});
