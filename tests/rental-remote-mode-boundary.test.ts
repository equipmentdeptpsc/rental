import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationDependencyProvider, createLocalApplicationDependencies, PersistenceMode, type ApplicationDependencies } from "@/app/composition";
import { repositoryFailure, repositorySuccess } from "@/core/persistence";
import { useRentalListData, type RentalListData } from "@/features/rental/hooks/useRentalListData";
import { canUseCanonicalRemoteRentalMutations, canUseLegacyRentalMutations } from "@/features/rental/services/rentalRuntimeCapability";

const empty: RentalListData = { rentals: [], rentalEquipmentLines: [], equipment: [], assignments: [], operators: [], projects: [], customers: [] };
const fallback: RentalListData = { ...empty, rentals: [{ id: "local-rental", status: "Draft" } as RentalListData["rentals"][number]] };
const roots: Root[] = [];

function dependencies(list: ReturnType<typeof vi.fn>): ApplicationDependencies {
  const local = createLocalApplicationDependencies();
  const repository = { ...local.readRepositories.rentals, list };
  return {
    ...local,
    readRepositories: {
      ...local.readRepositories,
      users: repository, rentals: repository, rentalEquipmentLines: repository,
      equipment: repository, assignments: repository, operators: repository,
      customers: repository, projects: repository, billing: repository, deurs: repository,
      workDescriptions: repository,
    } as ApplicationDependencies["readRepositories"],
    configuration: { ...local.configuration, persistenceMode: PersistenceMode.Remote, remoteOperationalWritesEnabled: true },
  };
}

function renderHook(deps: ApplicationDependencies) {
  const container = document.createElement("div");
  const root = createRoot(container); roots.push(root);
  function Probe() {
    const state = useRentalListData(fallback);
    return createElement("button", { onClick: state.retry }, `${state.status}:${state.data.rentals.map((item) => item.id).join(",")}:${"message" in state ? state.message : ""}`);
  }
  return { container, root, element: createElement(ApplicationDependencyProvider, { dependencies: deps }, createElement(Probe)) };
}

afterEach(async () => { while (roots.length) await act(async () => roots.pop()?.unmount()); });

describe("Rental remote-mode boundary", () => {
  it("allows legacy Rental mutations only in local persistence mode", () => {
    const local = createLocalApplicationDependencies().configuration;
    expect(canUseLegacyRentalMutations(local)).toBe(true);
    expect(canUseLegacyRentalMutations({ ...local, persistenceMode: PersistenceMode.Remote, remoteOperationalWritesEnabled: false })).toBe(false);
    expect(canUseLegacyRentalMutations({ ...local, persistenceMode: PersistenceMode.Remote, remoteOperationalWritesEnabled: true })).toBe(false);
    expect(canUseCanonicalRemoteRentalMutations(local)).toBe(false);
    expect(canUseCanonicalRemoteRentalMutations({ ...local, persistenceMode: PersistenceMode.Remote, remoteOperationalWritesEnabled: false })).toBe(false);
    expect(canUseCanonicalRemoteRentalMutations({ ...local, persistenceMode: PersistenceMode.Remote, remoteOperationalWritesEnabled: true })).toBe(true);
  });

  it("never exposes local fallback while canonical remote Rental data is loading or fails", async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => { resolve = done; });
    const list = vi.fn(() => pending);
    const rendered = renderHook(dependencies(list));
    await act(async () => rendered.root.render(rendered.element));
    expect(rendered.container.textContent).toBe("loading::");
    await act(async () => resolve(repositoryFailure("REMOTE_FAILED", "failed", { context: {}, recoverability: "RETRYABLE", recommendedAction: "Retry" }) as never));
    expect(rendered.container.textContent).toContain("error::Canonical Rental data could not be loaded");
    expect(rendered.container.textContent).not.toContain("local-rental");
  });

  it("loads the canonical remote dataset and retries an explicit error", async () => {
    const success = repositorySuccess({ items: [], nextCursor: undefined });
    const failure = repositoryFailure("REMOTE_FAILED", "failed", { context: {}, recoverability: "RETRYABLE", recommendedAction: "Retry" });
    const list = vi.fn().mockResolvedValueOnce(failure).mockResolvedValue(success);
    const rendered = renderHook(dependencies(list));
    await act(async () => rendered.root.render(rendered.element));
    expect(rendered.container.textContent).toContain("error:");
    await act(async () => rendered.container.querySelector("button")?.click());
    expect(rendered.container.textContent).toBe("loaded::");
    expect(list.mock.calls.length).toBeGreaterThanOrEqual(7);
  });
});
