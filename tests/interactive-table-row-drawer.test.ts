import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import InteractiveTableRow from "@/components/ui/InteractiveTableRow";
import DetailsDrawer from "@/components/ui/DetailsDrawer";

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
async function render(element: React.ReactNode) {
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container); mounted.push({ root, container });
  await act(async () => root.render(element)); return container;
}
afterEach(async () => { while (mounted.length) { const item = mounted.pop()!; await act(async () => item.root.unmount()); item.container.remove(); } vi.useRealTimers(); });

describe("shared table row", () => {
  it("opens from pointer and keyboard while ignoring nested controls", async () => {
    const open = vi.fn();
    const container = await render(createElement("table", null, createElement("tbody", null,
      createElement(InteractiveTableRow, { onOpen: open, selected: true, "aria-label": "Open equipment" },
        createElement("td", null, "Equipment"),
        createElement("td", null, createElement("button", { type: "button" }, "Edit"), createElement("input", { type: "checkbox", "aria-label": "Select" }), createElement("a", { href: "#details" }, "Full details"))))));
    const row = container.querySelector("tr")!;
    await act(async () => row.querySelector("td")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(open).toHaveBeenCalledTimes(1);
    await act(async () => row.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })));
    await act(async () => row.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: " " })));
    expect(open).toHaveBeenCalledTimes(3);
    await act(async () => row.querySelector("button")!.click());
    await act(async () => row.querySelector("input")!.click());
    await act(async () => row.querySelector("a")!.click());
    expect(open).toHaveBeenCalledTimes(3);
    expect(row.getAttribute("tabindex")).toBe("0");
    expect(row.className).toContain("hover:bg-amber-50/60");
    expect(row.className).toContain("!bg-blue-50/80");
  });
});

describe("shared detail drawer", () => {
  it("closes with Escape, traps focus, and restores the prior control", async () => {
    const close = vi.fn();
    const trigger = document.createElement("button"); document.body.appendChild(trigger); trigger.focus();
    const container = await render(createElement(DetailsDrawer, { open: true, title: "Equipment details", onClose: close }, createElement("button", null, "Action")));
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(document.activeElement).toBe(dialog);
    expect(dialog.className).toContain("w-full");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })));
    expect(close).toHaveBeenCalledTimes(1);
    await act(async () => mounted[0].root.render(createElement(DetailsDrawer, { open: false, title: "Equipment details", onClose: close }, null)));
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("slides in and out, fades the backdrop, and supports reduced motion", async () => {
    vi.useFakeTimers();
    function Harness() {
      const [open, setOpen] = useState(true);
      return createElement(DetailsDrawer, { open, title: "Equipment details", onClose: () => setOpen(false) }, createElement("button", null, "Action"));
    }
    const container = await render(createElement(Harness));
    await act(async () => vi.advanceTimersByTime(20));
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    const backdrop = container.querySelector("div.absolute.inset-0") as HTMLElement;
    expect(dialog.style.transform).toBe("translateX(0)");
    expect(dialog.style.transition).toContain("ease-out");
    expect(backdrop.style.opacity).toBe("1");
    expect(dialog.className).toContain("motion-reduce:!transition-none");
    await act(async () => dialog.querySelector('button[aria-label="Close details"]')?.click());
    expect(dialog.style.transform).toBe("translateX(100%)");
    expect(dialog.style.transition).toContain("ease-in");
    expect(dialog.getAttribute("aria-hidden")).toBe("true");
    await act(async () => vi.advanceTimersByTime(220));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    vi.useRealTimers();
  });
});
