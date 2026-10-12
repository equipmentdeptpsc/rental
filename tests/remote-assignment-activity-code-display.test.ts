import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import RemoteAssignmentActivityCodeDisplay from "@/features/assignment/components/RemoteAssignmentActivityCodeDisplay";

describe("canonical Assignment Activity Code display", () => {
  it("uses the canonical lookup in Assignment Details instead of rendering the relationship UUID", () => {
    const details = readFileSync("src/pages/Assignments/Details.tsx", "utf8");
    expect(details).toContain("<RemoteAssignmentActivityCodeDisplay activityCodeId={assignment.activityCodeId} repository={commandRepositories.canonicalRental} />");
    expect(details).not.toContain('Info label="Activity Code ID"');
  });

  it("resolves a canonical code and name without exposing its UUID, including after refresh", async () => {
    const readReferenceData = vi.fn(async () => ({ success: true as const, value: { costCodes: [], activityCodes: [{ id: "activity-uuid-1", code: "LDC", name: "Loading", active: true, sortOrder: 1 }] } }));
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(createElement(RemoteAssignmentActivityCodeDisplay, { activityCodeId: "activity-uuid-1", repository: { readReferenceData } })));
    expect(container.textContent).toContain("LDC — Loading");
    expect(container.textContent).not.toContain("activity-uuid-1");
    await act(async () => root.render(createElement(RemoteAssignmentActivityCodeDisplay, { activityCodeId: "missing-uuid", repository: { readReferenceData } })));
    expect(container.textContent).toContain("Activity Code unavailable or inactive");
    expect(container.textContent).not.toContain("missing-uuid");
    await act(async () => root.unmount());
  });

  it("does not invent labels for absent or unreadable reference records", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(createElement(RemoteAssignmentActivityCodeDisplay)));
    expect(container.textContent).toContain("Not configured");
    await act(async () => root.render(createElement(RemoteAssignmentActivityCodeDisplay, { activityCodeId: "protected-uuid", repository: { readReferenceData: async () => ({ success: false as const, code: "FORBIDDEN", message: "Forbidden" }) } })));
    expect(container.textContent).toContain("Activity Code unavailable or inactive");
    expect(container.textContent).not.toContain("protected-uuid");
    await act(async () => root.unmount());
  });
});
