import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (permission: string) => permission === "rental.manage" }) }));

import { ApplicationDependencyProvider, createLocalApplicationDependencies, PersistenceMode, type ApplicationDependencies } from "@/app/composition";
import { repositoryFailure, repositorySuccess } from "@/core/persistence";
import { getAssignmentRuntimeCapability } from "@/features/assignment/services/assignmentRuntimeCapability";
import Assignments from "@/pages/Assignments";
import AssignmentDetails from "@/pages/Assignments/Details";
import NewAssignment from "@/pages/Assignments/New";
import EditAssignment from "@/pages/Assignments/Edit";

const roots: Root[] = [];
const page = (items: unknown[]) => repositorySuccess({ items, nextCursor: undefined });
const assignment = { id: "canonical-assignment", equipmentId: "canonical-equipment", operatorId: "canonical-operator", projectId: "canonical-project", assignedDate: "2026-08-23", expectedReturn: "2026-08-24", remarks: "Canonical", status: "Active" as const };

function remoteDependencies(input: { assignments?: unknown[]; failure?: boolean } = {}): ApplicationDependencies {
  const local = createLocalApplicationDependencies();
  const failure = repositoryFailure("REMOTE_FAILED", "failed", { context: {}, recoverability: "RETRYABLE", recommendedAction: "Retry" });
  const repository = (items: unknown[]) => ({ ...local.readRepositories.assignments, list: vi.fn(async () => input.failure ? failure : page(items)) });
  return {
    ...local,
    repositories: { ...local.repositories, assignment: { ...local.repositories.assignment, getAll: () => [{ ...assignment, id: "local-only-assignment" }] } },
    readRepositories: {
      ...local.readRepositories,
      assignments: repository(input.assignments ?? []),
      equipment: repository([{ id: "canonical-equipment", assetNo: "ME-REMOTE", equipmentName: "Remote Equipment" }]),
      operators: repository([{ id: "canonical-operator", name: "Remote Operator" }]),
      projects: repository([{ id: "canonical-project", project_code: "REMOTE", name: "Remote Project", active: true }]),
    } as ApplicationDependencies["readRepositories"],
    commandRepositories: { ...local.commandRepositories, canonicalRental: {} as ApplicationDependencies["commandRepositories"]["canonicalRental"] },
    configuration: { ...local.configuration, persistenceMode: PersistenceMode.Remote, remoteOperationalWritesEnabled: true },
  };
}

async function render(element: React.ReactNode, dependencies = remoteDependencies(), route = "/") {
  const container = document.createElement("div");
  const root = createRoot(container); roots.push(root);
  await act(async () => root.render(createElement(ApplicationDependencyProvider, { dependencies }, createElement(MemoryRouter, { initialEntries: [route] }, element))));
  return container;
}

afterEach(async () => { while (roots.length) await act(async () => roots.pop()?.unmount()); });

describe("canonical Assignment remote UI boundary", () => {
  it("keeps remote list empty when only a local Assignment exists", async () => {
    const container = await render(createElement(Assignments));
    expect(container.textContent).toContain("No canonical Assignments found.");
    expect(container.textContent).not.toContain("local-only-assignment");
    expect(container.textContent).not.toContain("New Assignment");
  });

  it("renders canonical Assignment and deliberately adapted related records", async () => {
    const container = await render(createElement(Assignments), remoteDependencies({ assignments: [assignment] }));
    expect(container.textContent).toContain("ME-REMOTE — Remote Equipment");
    expect(container.textContent).toContain("Remote Operator");
    expect(container.textContent).toContain("Remote Project");
    expect(container.querySelector('a[href="/assignments/canonical-assignment"]')).not.toBeNull();
  });

  it("keeps repository errors authoritative", async () => {
    const container = await render(createElement(Assignments), remoteDependencies({ failure: true }));
    expect(container.getAttribute("role") ?? container.querySelector('[role="alert"]')?.getAttribute("role")).toBe("alert");
    expect(container.textContent).toContain("Canonical Assignment data could not be loaded");
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

  it("preserves local read and mutation capability", () => {
    const local = createLocalApplicationDependencies().configuration;
    expect(getAssignmentRuntimeCapability(local)).toMatchObject({ legacyReads: true, legacyMutations: true, canonicalReads: false });
    expect(getAssignmentRuntimeCapability({ ...local, persistenceMode: PersistenceMode.Remote })).toMatchObject({ legacyReads: false, legacyMutations: false, canonicalReads: true });
  });
});
