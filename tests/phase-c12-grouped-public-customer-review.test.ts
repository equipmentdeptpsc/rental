// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicCustomerReviewBatch, PublicCustomerReviewBatchRepository } from "@/features/rental/customer-review/publicGroupedReviewContracts";
import { SupabasePublicCustomerReviewBatchRepository } from "@/integrations/supabase/SupabasePublicCustomerReviewBatchRepository";
import GroupedCustomerReviewPage from "@/pages/GroupedCustomerReview";

const batch: PublicCustomerReviewBatch = {
  company: "UAT Equipment Company", customer: "Grouped Customer", project: "Grouped Project",
  rental: "GROUPED-001", reviewDate: "2026-08-11", displayDate: "2026-08-11", businessTimezone: "Asia/Manila",
  totalLineCount: 3, actionableCount: 2, inProgressCount: 1, acknowledgedCount: 0,
  correctionRequestedCount: 0, batchStatus: "OPEN",
  items: [
    { publicItemId: "item-a", equipmentName: "Excavator A", assetNumber: "A-1", operator: "Operator A", deurNumber: "DEUR-A", revisionLabel: "R1", workDate: "2026-08-11", timeline: [], reviewState: "SUBMITTED_AWAITING_ACKNOWLEDGEMENT", availableActions: ["ACKNOWLEDGE", "REQUEST_CORRECTION"] },
    { publicItemId: "item-b", equipmentName: "Excavator B", assetNumber: "B-1", operator: "Operator B", deurNumber: "DEUR-B", revisionLabel: "R1", workDate: "2026-08-11", timeline: [], reviewState: "SUBMITTED_AWAITING_ACKNOWLEDGEMENT", availableActions: ["ACKNOWLEDGE", "REQUEST_CORRECTION"] },
    { publicItemId: "item-c", equipmentName: "Excavator C", assetNumber: "C-1", operator: "Operator C", workDate: "2026-08-11", timeline: [], reviewState: "IN_PROGRESS", availableActions: [] },
  ],
};

describe("grouped public Customer Review repository", () => {
  it("maps only the grouped RPC contract and never forwards canonical authority", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { success: true, disposition: "AVAILABLE", value: batch }, error: null });
    const repository = new SupabasePublicCustomerReviewBatchRepository({ schema: vi.fn(() => ({ rpc })) });
    await repository.lookup("credential");
    await repository.acknowledgeItem("credential", "item-a", { commandId: "a", idempotencyKey: "a" });
    await repository.requestCorrection("credential", "item-b", "  Incorrect operating duration.  ", { commandId: "b", idempotencyKey: "b" });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["get_customer_review_batch", "acknowledge_customer_review_batch_item", "request_customer_review_batch_item_correction"]);
    expect(rpc.mock.calls[2][1].command.remarks).toBe("Incorrect operating duration.");
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/tenantId|companyId|deurId|revisionId|requestId|rentalId/);
  });
});

describe("grouped public Customer Review page", () => {
  let root: Root | undefined;
  afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; document.body.innerHTML = ""; vi.restoreAllMocks(); });
  async function render(repository: PublicCustomerReviewBatchRepository) {
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(createElement(
      MemoryRouter,
      { initialEntries: ["/review/customer/grouped/opaque"] },
      createElement(Routes, null, createElement(Route, {
        path: "/review/customer/grouped/:credential",
        element: createElement(GroupedCustomerReviewPage, { repository }),
      })),
    )));
    return container;
  }

  it("renders the header, three states, timelines, and line-only actions", async () => {
    const repository: PublicCustomerReviewBatchRepository = { lookup: vi.fn().mockResolvedValue({ success: true, disposition: "AVAILABLE", value: batch }), acknowledgeItem: vi.fn(), requestCorrection: vi.fn() };
    const container = await render(repository);
    expect(container.textContent).toContain("UAT Equipment Company"); expect(container.textContent).toContain("Grouped Customer");
    expect(container.textContent).toContain("SUBMITTED AWAITING ACKNOWLEDGEMENT"); expect(container.textContent).toContain("IN PROGRESS"); expect(container.textContent).toContain("Activity Timeline");
    expect([...container.querySelectorAll("button")].filter(button => button.textContent === "Acknowledge DEUR")).toHaveLength(2);
    expect(container.textContent).not.toMatch(/Acknowledge All|Bulk/);
  });

  it("keeps the same credential, refreshes from the server, and leaves other lines in place", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const after = { ...batch, actionableCount: 1, acknowledgedCount: 1, batchStatus: "PARTIALLY_REVIEWED" as const, items: batch.items.map(item => item.publicItemId === "item-a" ? { ...item, reviewState: "ACKNOWLEDGED" as const, availableActions: [] } : item) };
    const lookup = vi.fn().mockResolvedValueOnce({ success: true, disposition: "AVAILABLE", value: batch }).mockResolvedValue({ success: true, disposition: "AVAILABLE", value: after });
    const acknowledgeItem = vi.fn().mockResolvedValue({ success: true, disposition: "ACCEPTED", value: after });
    const repository: PublicCustomerReviewBatchRepository = { lookup, acknowledgeItem, requestCorrection: vi.fn() };
    const container = await render(repository); const button = [...container.querySelectorAll("button")].find(item => item.textContent === "Acknowledge DEUR")!;
    await act(async () => button.click());
    expect(acknowledgeItem).toHaveBeenCalledWith("opaque", "item-a", expect.any(Object)); expect(lookup).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Excavator B"); expect(container.textContent).toContain("Excavator C"); expect(window.location.pathname).not.toContain("completed");
  });

  it("uses a line-scoped correction dialog with identifying evidence", async () => {
    const repository: PublicCustomerReviewBatchRepository = { lookup: vi.fn().mockResolvedValue({ success: true, disposition: "AVAILABLE", value: batch }), acknowledgeItem: vi.fn(), requestCorrection: vi.fn() };
    const container = await render(repository); const buttons = [...container.querySelectorAll("button")].filter(item => item.textContent === "Request Correction");
    await act(async () => buttons[1].click());
    const dialog = container.querySelector('[role="dialog"]')!; expect(dialog.textContent).toContain("Excavator B"); expect(dialog.textContent).toContain("B-1"); expect(dialog.textContent).toContain("DEUR-B R1");
  });
});
