import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import CanonicalBillingVisibilityPanel from "@/features/dashboard/components/CanonicalBillingVisibilityPanel";
import { summarizeCanonicalBillingVisibility } from "@/features/dashboard/services/canonicalBillingVisibility";
import type { DeurRecord } from "@/features/rental/deur/types";

const canonical = (overrides: Partial<DeurRecord> = {}) => ({
  id: "deur-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", workDate: "2026-09-01", logs: [], events: [], totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", status: "Draft" as const, legacy: false, ...overrides,
}) as DeurRecord;

describe("canonical billing dashboard visibility", () => {
  const eligible = canonical({
    id: "ready",
    status: "Acknowledged",
    commercialSnapshot: { billingMethod: "Per Hour", unitRate: 100, currency: "PHP", operatorIncluded: true, capturedAt: "2026-09-01T00:00:00.000Z" },
    events: [
      { id: "shift-start", activityType: "shift", action: "start", timestamp: "2026-09-01T00:00:00.000Z", sequence: 1, source: "user" },
      { id: "operation-start", activityType: "operation", action: "start", timestamp: "2026-09-01T01:00:00.000Z", sequence: 2, source: "user" },
      { id: "operation-end", activityType: "operation", action: "end", timestamp: "2026-09-01T02:00:00.000Z", sequence: 3, source: "user" },
      { id: "shift-end", activityType: "shift", action: "end", timestamp: "2026-09-01T03:00:00.000Z", sequence: 4, source: "user" },
    ],
  });

  it("uses canonical eligibility and categorizes blockers without treating acknowledgements as ready", () => {
    const result = summarizeCanonicalBillingVisibility([
      eligible,
      canonical({ id: "draft" }),
      canonical({ id: "awaiting", status: "Submitted" }),
      canonical({ id: "correction", status: "Rejected" }),
    ]);
    expect(result).toMatchObject({ readyForBilling: 1, blockerCount: 3, blockers: { "Incomplete DEUR": 1, "Awaiting customer acknowledgement": 1, "Pending correction": 1 } });
  });

  it("reports a truthful zero state without local or collection fallback", () => {
    expect(summarizeCanonicalBillingVisibility([])).toEqual({ readyForBilling: 0, blockerCount: 0, blockers: { "Awaiting customer acknowledgement": 0, "Pending correction": 0, "Incomplete DEUR": 0, "Billing setup incomplete": 0, "Other blocking state": 0 } });
  });

  it("links finance users to Billing and renders nothing when finance visibility is unauthorized", () => {
    const loaded = { status: "loaded" as const, data: summarizeCanonicalBillingVisibility([]), retry: () => undefined };
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(CanonicalBillingVisibilityPanel, { state: loaded })));
    expect(markup).toContain('href="/billing"');
    expect(markup).not.toContain("DEUR awaiting acknowledgement");
    const unavailable = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(CanonicalBillingVisibilityPanel, { state: { status: "unavailable", retry: () => undefined } })));
    expect(unavailable).toBe("");
  });
});
