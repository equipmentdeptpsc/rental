import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  ApplicationDependencyProvider,
  PersistenceMode,
  createLocalApplicationDependencies,
} from "@/app/composition";
import { PrefixProvider } from "@/features/settings/context/PrefixContext";
import Settings from "@/pages/Settings";

const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = [];

async function renderSettings(mode: PersistenceMode) {
  const dependencies = createLocalApplicationDependencies();
  dependencies.configuration.persistenceMode = mode;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(
    createElement(ApplicationDependencyProvider, { dependencies },
      createElement(MemoryRouter, null,
        createElement(PrefixProvider, null, createElement(Settings)))),
  ));
  return container;
}

afterEach(async () => {
  for (const item of mounted.splice(0)) {
    await act(async () => item.root.unmount());
    item.container.remove();
  }
});

describe("Settings development outbox visibility", () => {
  it("retains both local development outbox controls in local mode", async () => {
    const container = await renderSettings(PersistenceMode.Local);
    expect(container.textContent).toContain("Development Email Outbox");
    expect(container.querySelector('a[href="/development-email-outbox"]')?.textContent).toBe("Open Development Email Outbox");
    expect(container.querySelector('a[href="/development-customer-review-outbox"]')?.textContent).toBe("Open Customer Review Outbox");
    expect(container.textContent).toContain("Manager Approver");
  });

  it("omits local-only outbox controls but preserves Manager Approver in remote mode", async () => {
    const container = await renderSettings(PersistenceMode.Remote);
    expect(container.textContent).not.toContain("Development Email Outbox");
    expect(container.querySelector('a[href="/development-email-outbox"]')).toBeNull();
    expect(container.querySelector('a[href="/development-customer-review-outbox"]')).toBeNull();
    expect(container.textContent).toContain("Manager Approver");
    expect(container.textContent).not.toContain("No production email provider is connected.");
  });
});
