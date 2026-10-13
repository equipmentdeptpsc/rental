import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationDependencyProvider, createLocalApplicationDependencies, type ApplicationDependencies } from "@/app/composition";
import type { ProjectCommandRepository, ProjectReviewRecipientProjection } from "@/features/project/commands/contracts";
import ProjectReviewRecipients from "@/features/project/components/ProjectReviewRecipients";

const auth = vi.hoisted(() => ({ permissions: new Set<string>(["project.read", "project.update"]) }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (permission: string) => auth.permissions.has(permission) }) }));

const projectId = "cbe724c2-cd45-4763-b7a2-62acdd8e7e2b";
const roots: Root[] = [];
const empty: ProjectReviewRecipientProjection = { projectId, recipients: [], rowVersion: 0 };

function dependencies(input: {
  read?: NonNullable<ProjectCommandRepository["readProjectReviewRecipients"]>;
  update?: NonNullable<ProjectCommandRepository["updateProjectReviewRecipients"]>;
} = {}) {
  const base = createLocalApplicationDependencies();
  const read = input.read ?? vi.fn(async () => ({ success: true as const, value: empty }));
  const update = input.update ?? vi.fn(async (command) => ({
    success: true as const, disposition: "ACCEPTED" as const, serverOccurredAt: "2026-10-13T00:00:00Z",
    refresh: [projectId], value: { projectId, recipients: command.recipients, rowVersion: 1 },
  }));
  const value: ApplicationDependencies = {
    ...base,
    commandRepositories: { ...base.commandRepositories, canonicalProject: { createProject: vi.fn(), readProjectReviewRecipients: read, updateProjectReviewRecipients: update } },
  };
  return { value, read, update };
}

async function render(value: ApplicationDependencies) {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push(root);
  await act(async () => { root.render(createElement(ApplicationDependencyProvider, { dependencies: value }, createElement(ProjectReviewRecipients, { projectId }))); await Promise.resolve(); });
  return container;
}

function enter(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(async () => {
  auth.permissions = new Set(["project.read", "project.update"]);
  while (roots.length) await act(async () => roots.pop()?.unmount());
});

describe("Project Customer Review recipient maintenance", () => {
  it("shows an explicit missing-configuration blocker and saves normalized multiple recipients through the command", async () => {
    const setup = dependencies();
    const container = await render(setup.value);
    expect(container.textContent).toContain("No Project reviewer configured");
    const add = [...container.querySelectorAll("button")].find((button) => button.textContent === "Add reviewer")!;
    await act(async () => { add.click(); add.click(); });
    const names = container.querySelectorAll<HTMLInputElement>('input:not([type="email"])');
    const emails = container.querySelectorAll<HTMLInputElement>('input[type="email"]');
    await act(async () => {
      enter(names[0], "First reviewer");
      enter(emails[0], "FIRST@EXAMPLE.INVALID");
      enter(names[1], "Second reviewer");
      enter(emails[1], "second@example.invalid");
    });
    await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === "Save reviewers")!.click(); await Promise.resolve(); });
    expect(setup.update).toHaveBeenCalledWith(expect.objectContaining({ projectId, expectedVersion: 0,
      recipients: [{ name: "First reviewer", email: "first@example.invalid" }, { name: "Second reviewer", email: "second@example.invalid" }] }));
    expect(container.textContent).toContain("Existing dispatches keep their original recipients");
  });

  it("suppresses contact data and edits without project.read, and edits without project.update", async () => {
    auth.permissions = new Set();
    const setup = dependencies({ read: vi.fn(async () => ({ success: true as const, value: { projectId, recipients: [{ name: "Protected", email: "protected@example.invalid" }], rowVersion: 1 } })) });
    const hidden = await render(setup.value);
    expect(hidden.textContent).not.toContain("Protected");
    expect(setup.read).not.toHaveBeenCalled();
    auth.permissions = new Set(["project.read"]);
    const visible = await render(setup.value);
    expect(visible.textContent).not.toContain("Save reviewers");
    expect(visible.querySelector("input")?.disabled).toBe(true);
  });
});
