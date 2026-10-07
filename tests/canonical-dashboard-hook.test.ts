import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ read: vi.fn(async (_dependencies: unknown, _options: unknown) => ({})), dependencies: {} }));
vi.mock("@/app/composition", () => ({ useApplicationDependenciesCompatibility: () => mocked.dependencies }));
vi.mock("@/features/dashboard/services/canonicalDashboardRead", () => ({ readCanonicalDashboard: mocked.read }));

import { useCanonicalDashboardViewModel } from "@/features/dashboard/hooks/useCanonicalDashboardViewModel";

const roots: Root[] = [];
afterEach(async () => { while (roots.length) await act(async () => roots.pop()?.unmount()); vi.clearAllMocks(); });

function Probe({ refreshKey }: { refreshKey: number }) {
  const state = useCanonicalDashboardViewModel(refreshKey, false);
  return createElement("p", null, state.status);
}

describe("canonical dashboard hook", () => {
  it("performs a new canonical read when Refresh changes the key", async () => {
    const node = document.createElement("div");
    const root = createRoot(node); roots.push(root);
    await act(async () => { root.render(createElement(Probe, { refreshKey: 0 })); await Promise.resolve(); });
    expect(mocked.read).toHaveBeenCalledTimes(1);
    expect(node.textContent).toBe("loaded");
    await act(async () => { root.render(createElement(Probe, { refreshKey: 1 })); await Promise.resolve(); });
    expect(mocked.read).toHaveBeenCalledTimes(2);
    expect(mocked.read.mock.calls[1]?.[1]).toMatchObject({ canReadAudit: false, canReadFinancial: false, signal: expect.any(AbortSignal) });
  });
});
