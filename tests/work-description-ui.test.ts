import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import WorkDescriptionTable from "@/features/masters/work-description/components/WorkDescriptionTable";
import WorkDescriptionForm from "@/features/masters/work-description/components/WorkDescriptionForm";
import type { WorkDescriptionRecord } from "@/features/masters/work-description/types";
import { router } from "@/app/router";

const record: WorkDescriptionRecord = {
  id: "work-description-other-operation",
  code: "OTHER_OPERATION",
  name: "OTHER OPERATION",
  active: false,
  deleted: false,
  sortOrder: 80,
  operatorSelectable: true,
  requiresRemarks: true,
};

describe("Work Description master UI", () => {
  it("renders names, Requires Remarks, and inactive state without internal IDs", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(createElement(WorkDescriptionTable, {
      records: [record], categories: [], onEdit: vi.fn(), onDelete: vi.fn(), onRestore: vi.fn(),
    })));
    expect(container.textContent).toContain("OTHER OPERATION");
    expect(container.textContent).toContain("Requires Remarks");
    expect(container.textContent).toContain("Inactive");
    expect(container.textContent).not.toContain("work-description-other-operation");
    await act(async () => root.unmount());
  });

  it("rejects duplicate normalized values and preserves identity on edit", async () => {
    const save = vi.fn();
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(createElement(WorkDescriptionForm, {
      editing: { ...record, id: "different", name: " other   operation " },
      existingRecords: [record],
      categories: [],
      onSave: save,
      onCancel: vi.fn(),
    })));
    await act(async () => [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Update"))?.click());
    expect(save).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("Work Description already exists.");
    expect(container.querySelector("input")?.value).toBe("OTHER_OPERATION");
    alert.mockRestore();
    await act(async () => root.unmount());
  });

  it("preserves stable identity for valid edits", async () => {
    const save = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(createElement(WorkDescriptionForm, {
      editing: record, existingRecords: [record], categories: [], onSave: save, onCancel: vi.fn(),
    })));
    await act(async () => [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Update"))?.click());
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: record.id }));
    await act(async () => root.unmount());
  });

  it("registers the Settings route", () => {
    const paths = router.routes.flatMap((route) => route.children?.map((child) => child.path) ?? []);
    expect(paths).toContain("settings/work-descriptions");
  });
});
