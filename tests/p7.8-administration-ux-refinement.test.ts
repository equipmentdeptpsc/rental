import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "@/core/storage";
import { LocalAdministrationRepository } from "@/features/administration/repository/LocalAdministrationRepository";
import AuditTrailPage from "@/features/administration/pages/AuditTrailPage";

const change = async (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  await act(async () => element.dispatchEvent(new Event("change", { bubbles: true })));
};

describe("P7.8 Administration UX refinement", () => {
  beforeEach(() => storage.clear());
  it("sorts, filters, and paginates audit evidence without deleting events", async () => {
    const repo = new LocalAdministrationRepository();
    for (let index = 0; index < 30; index++) repo.appendAudit({ id: `event-${String(index).padStart(2, "0")}`, actorId: index % 2 ? "admin-a" : "admin-b", targetType: index % 3 ? "USER" : "ROLE", targetId: index % 3 ? `user-${index}` : "dispatcher", action: index % 3 ? "USER_DEACTIVATED" : "ROLE_PERMISSION_ADDED", occurredAt: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`, metadata: index % 3 ? undefined : { permissionCode: `rental.permission-${index}` } });
    const container = document.createElement("div"), root = createRoot(container);
    await act(async () => root.render(createElement(AuditTrailPage)));
    expect(container.querySelectorAll("tbody tr")).toHaveLength(20);
    expect(container.querySelector("tbody tr")?.textContent).toContain("Aug 30");
    expect(container.textContent).toContain("Showing 1–20 of 30 events");
    expect(container.textContent).toContain("Permission Added to Role");
    expect(container.textContent).not.toContain("None → None");
    const next = container.querySelector('button[aria-label="Next audit page"]') as HTMLButtonElement;
    await act(async () => next.click());
    expect(container.querySelectorAll("tbody tr")).toHaveLength(10);
    const size = container.querySelector("#audit-page-size") as HTMLSelectElement;
    await change(size, "50");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(30);
    const actor = container.querySelector("#audit-actor") as HTMLSelectElement;
    await change(actor, "admin-a");
    expect(container.textContent).toContain("of 15 events");
    const action = container.querySelector("#audit-action") as HTMLSelectElement;
    await change(action, "USER_DEACTIVATED");
    const target = container.querySelector("#audit-target") as HTMLInputElement;
    await change(target, "user-1");
    expect(container.querySelectorAll("tbody tr").length).toBeGreaterThan(0);
    const search = container.querySelector("#audit-search") as HTMLInputElement;
    await change(search, "USER_DEACTIVATED");
    const from = container.querySelector("#audit-from") as HTMLInputElement, to = container.querySelector("#audit-to") as HTMLInputElement;
    await change(from, "2026-08-01"); await change(to, "2026-08-30");
    expect(repo.getAuditEvents()).toHaveLength(30);
    const clear = [...container.querySelectorAll("button")].find((item) => item.textContent === "Clear Filters") as HTMLButtonElement;
    await act(async () => clear.click());
    expect(container.textContent).toContain("of 30 events");
    await act(async () => root.unmount());
  });
});
