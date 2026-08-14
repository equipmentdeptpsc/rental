import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "@/core/storage";
import Settings from "@/pages/Settings";
import { PrefixProvider } from "@/features/settings/context/PrefixContext";

describe("Prefix Master UI", () => {
  beforeEach(() => storage.clear());
  it("opens New Prefix without submitting or freezing and renders category controls", async () => {
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
    await act(async () => root.render(createElement(MemoryRouter, { children: createElement(PrefixProvider, { children: createElement(Settings) }) })));
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("New Prefix"));
    expect(button?.type).toBe("button");
    await act(async () => button?.click());
    expect(button?.closest("div.rounded-xl")?.textContent).toContain("Equipment Prefix Master");
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector('[aria-labelledby="prefix-dialog-title"]')?.textContent).toContain("New Equipment Prefix");
    expect(container.textContent).toContain("Equipment Category");
    expect(container.textContent).toContain("Create Prefix");
    expect(container.querySelector("form input")).not.toBeNull();
    const cancel=[...container.querySelectorAll("button")].find(item=>item.textContent==="Cancel");await act(async()=>cancel?.click());expect(container.querySelector('[role="dialog"]')).toBeNull();expect(document.activeElement).toBe(button);
    await act(async () => root.unmount()); container.remove();
  });
});
