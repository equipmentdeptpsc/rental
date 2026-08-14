import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { Badge, DataTable, PageHeader } from "@/shared/components";

const render = async (element: ReactNode) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, root };
};

describe("Phase 1 UI foundation", () => {
  it("provides accessible labeled fields, errors, and disabled loading actions", async () => {
    const { container, root } = await render(
      createElement(
        "div",
        null,
        createElement(Input, {
          label: "Asset Number",
          required: true,
          error: "Asset Number is required.",
        }),
        createElement(Select, {
          label: "Status",
          helperText: "Current operational status",
          options: [{ label: "Available", value: "available" }],
        }),
        createElement(Button, { loading: true }, "Save Equipment"),
      ),
    );

    const input = container.querySelector("input")!;
    const select = container.querySelector("select")!;
    const button = container.querySelector("button")!;
    expect(input.labels?.item(0)?.textContent).toContain("Asset Number");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("required");
    expect(select.labels?.item(0)?.textContent).toBe("Status");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await act(async () => root.unmount());
  });

  it("renders consistent page, badge, and empty-table hierarchy", async () => {
    const { container, root } = await render(
      createElement(
        "div",
        null,
        createElement(PageHeader, {
          eyebrow: "Operations",
          title: "Equipment",
          description: "Manage fleet availability.",
          actions: createElement(Button, { size: "sm" }, "Add Equipment"),
        }),
        createElement(Badge, { tone: "success" }, "Available"),
        createElement(
          DataTable,
          { empty: true, emptyMessage: "No equipment found." },
          createElement("table"),
        ),
      ),
    );

    expect(container.querySelector("h1")?.textContent).toBe("Equipment");
    expect(container.textContent).toContain("Available");
    expect(container.textContent).toContain("No equipment found.");
    await act(async () => root.unmount());
  });
});
