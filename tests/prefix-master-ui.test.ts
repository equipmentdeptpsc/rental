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
    const container = document.createElement("div"), root = createRoot(container);
    await act(async () => root.render(createElement(MemoryRouter, { children: createElement(PrefixProvider, { children: createElement(Settings) }) })));
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("New Prefix"));
    expect(button?.type).toBe("button");
    await act(async () => button?.click());
    expect(container.textContent).toContain("Equipment Category");
    expect(container.textContent).toContain("Create Prefix");
    expect(container.querySelector("form input")).not.toBeNull();
    await act(async () => root.unmount());
  });
});
