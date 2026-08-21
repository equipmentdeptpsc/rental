import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useFormSubmission } from "@/components/form/useFormSubmission";
import { ToastProvider } from "@/components/ui/toast/ToastContext";

function Harness({ save }: { save(value: string): Promise<void> }) {
  const [value, setValue] = useState("entered value");
  const submission = useFormSubmission("Operator", save);
  return createElement("form", { onSubmit: (event: React.FormEvent) => { event.preventDefault(); void submission.submit(value); } },
    submission.feedback,
    createElement("input", { "aria-label": "Value", value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValue(event.target.value) }),
    createElement("button", { disabled: submission.busy, type: "submit" }, submission.busy ? "Saving..." : "Save"),
  );
}

function render(save: (value: string) => Promise<void>) {
  const container = document.createElement("div"), root = createRoot(container);
  return { container, root, element: createElement(ToastProvider, null, createElement(Harness, { save })) };
}

describe("Milestone 7 form feedback", () => {
  it("prevents duplicate submission and announces success only after persistence", async () => {
    let finish!: () => void;
    const save = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const view = render(save);
    await act(async () => view.root.render(view.element));
    const form = view.container.querySelector("form")!;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).not.toContain("saved successfully");
    await act(async () => finish());
    expect(view.container.textContent).toContain("Operator saved successfully.");
    await act(async () => view.root.unmount());
  });

  it("shows a visible failure and retains entered state", async () => {
    const save = vi.fn(async () => { throw new Error("Equipment Code already exists."); });
    const view = render(save);
    await act(async () => view.root.render(view.element));
    await act(async () => view.container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("Equipment Code already exists.");
    expect((view.container.querySelector('[aria-label="Value"]') as HTMLInputElement).value).toBe("entered value");
    expect((view.container.querySelector("button") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => view.root.unmount());
  });
});
