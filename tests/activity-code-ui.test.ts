import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import ActivityCodeTable from "@/features/masters/activity-code/components/ActivityCodeTable";
import ActivityCodeForm from "@/features/masters/activity-code/components/ActivityCodeForm";
import type { ActivityCodeRecord } from "@/features/masters/activity-code/types";

const record: ActivityCodeRecord = {
  id: "ldc-id",
  activityCode: "LDC",
  description: "LAUCHANCO DEVELOPMENT CORPORATION",
  active: false,
  deleted: false,
};

describe("Activity Code master UI", () => {
  it("renders code, name, and inactive state", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(createElement(ActivityCodeTable, {
      records: [record], onEdit: vi.fn(), onDelete: vi.fn(),
    })));

    expect(container.textContent).toContain("LDC");
    expect(container.textContent).toContain("LAUCHANCO DEVELOPMENT CORPORATION");
    expect(container.textContent).toContain("Inactive");
    await act(async () => root.unmount());
  });

  it("preserves stable identity when editing", async () => {
    const save = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(createElement(ActivityCodeForm, {
      editing: record, existingRecords: [record], onSave: save, onCancel: vi.fn(),
    })));
    await act(async () => [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Update"))?.click());
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: "ldc-id" }));
    await act(async () => root.unmount());
  });

  it("rejects a normalized duplicate from the form", async () => {
    const save = vi.fn();
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(createElement(ActivityCodeForm, {
      editing: { ...record, id: "another-id", activityCode: " ldc " },
      existingRecords: [record],
      onSave: save,
      onCancel: vi.fn(),
    })));
    await act(async () => [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Update"))?.click());

    expect(save).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("Activity Code already exists.");
    alert.mockRestore();
    await act(async () => root.unmount());
  });
});
