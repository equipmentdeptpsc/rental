import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import AssignmentActivityCodeDisplay from "@/features/assignment/components/AssignmentActivityCodeDisplay";
import type { ActivityCodeRecord } from "@/features/masters/activity-code";

const record: ActivityCodeRecord = {
  id: "ldc",
  activityCode: "LDC",
  description: "LAUCHANCO DEVELOPMENT CORPORATION",
  active: true,
  deleted: false,
};

async function render(activityCodeId: string | undefined, records = [record]) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(createElement(AssignmentActivityCodeDisplay, {
    activityCodeId,
    records,
  })));
  return { container, root };
}

describe("Assignment Activity Code details display", () => {
  it("renders readable configured code and name without its internal ID", async () => {
    const { container, root } = await render("ldc");
    expect(container.textContent).toContain("LDC");
    expect(container.textContent).toContain("LAUCHANCO DEVELOPMENT CORPORATION");
    expect(container.textContent).not.toContain("activity-code-ldc");
    await act(async () => root.unmount());
  });

  it("renders missing, inactive, deleted, and unknown states safely", async () => {
    for (const [id, records, expected] of [
      [undefined, [record], "Activity Code not configured"],
      ["ldc", [{ ...record, active: false }], "Inactive"],
      ["ldc", [{ ...record, deleted: true }], "Deleted"],
      ["unknown", [record], "Activity Code not found"],
    ] as const) {
      const rendered = await render(id, [...records]);
      expect(rendered.container.textContent).toContain(expected);
      await act(async () => rendered.root.unmount());
    }
  });
});
