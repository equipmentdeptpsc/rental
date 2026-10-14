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
    await repository.acknowledgeItems("credential", ["item-a", "item-b"], { commandId: "c", idempotencyKey: "c" });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["get_customer_review_batch", "acknowledge_customer_review_batch_item", "request_customer_review_batch_item_correction", "acknowledge_customer_review_batch_items"]);
    expect(rpc.mock.calls[2][1].command.remarks).toBe("Incorrect operating duration.");
    expect(rpc.mock.calls[3][1].command.publicItemIds).toEqual(["item-a", "item-b"]);
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
    expect(container.textContent).toContain("Awaiting acknowledgement"); expect(container.textContent).toContain("In progress"); expect(container.textContent).toContain("Activity Timeline");
    expect(container.textContent).toContain("0 of 2 submitted DEURs reviewed · 2 remaining");
    expect(container.textContent).toContain("Work date: 2026-08-11");
    expect([...container.querySelectorAll("button")].filter(button => button.textContent === "Acknowledge DEUR")).toHaveLength(2);
    expect(container.textContent).not.toMatch(/Acknowledge All|Bulk/);
  });

  it("organizes Rental lines by work date and reports completion without a bulk action", async () => {
    const completed = { ...batch, actionableCount: 0, acknowledgedCount: 2, batchStatus: "COMPLETED" as const, items: batch.items.map((item, index) => ({ ...item, workDate: index === 0 ? "2026-08-10" : "2026-08-11", reviewState: index === 2 ? item.reviewState : "ACKNOWLEDGED" as const, availableActions: [] })) };
    const repository: PublicCustomerReviewBatchRepository = { lookup: vi.fn().mockResolvedValue({ success: true, disposition: "COMPLETED", value: completed }), acknowledgeItem: vi.fn(), requestCorrection: vi.fn() };
    const container = await render(repository);
    expect(container.textContent).toContain("Work date: 2026-08-10"); expect(container.textContent).toContain("Work date: 2026-08-11");
    expect(container.textContent).toContain("All pending DEURs in this review have been reviewed.");
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

  it("offers server-atomic bulk acknowledgement when supported and refreshes partial state", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const after = { ...batch, actionableCount: 0, acknowledgedCount: 2, batchStatus: "COMPLETED" as const,
      items: batch.items.map((item) => item.availableActions.length ? { ...item, reviewState: "ACKNOWLEDGED" as const, availableActions: [] } : item) };
    const lookup = vi.fn().mockResolvedValueOnce({ success: true, disposition: "AVAILABLE", value: batch })
      .mockResolvedValue({ success: true, disposition: "COMPLETED", value: after });
    const acknowledgeItems = vi.fn().mockResolvedValue({ success: true, disposition: "ACCEPTED", value: after });
    const repository: PublicCustomerReviewBatchRepository = { lookup, acknowledgeItem: vi.fn(), requestCorrection: vi.fn(), acknowledgeItems };
    const container = await render(repository);
    const bulk = [...container.querySelectorAll("button")].find((button) => button.textContent === "Acknowledge All Pending DEURs")!;
    await act(async () => { bulk.click(); await Promise.resolve(); });
    expect(acknowledgeItems).toHaveBeenCalledWith("opaque", ["item-a", "item-b"], expect.any(Object));
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("All pending DEURs in this review have been reviewed.");
  });

  it("uses a line-scoped correction dialog with identifying evidence", async () => {
    const repository: PublicCustomerReviewBatchRepository = { lookup: vi.fn().mockResolvedValue({ success: true, disposition: "AVAILABLE", value: batch }), acknowledgeItem: vi.fn(), requestCorrection: vi.fn() };
    const container = await render(repository); const buttons = [...container.querySelectorAll("button")].filter(item => item.textContent === "Request Correction");
    await act(async () => buttons[1].click());
    const dialog = container.querySelector('[role="dialog"]')!; expect(dialog.textContent).toContain("Excavator B"); expect(dialog.textContent).toContain("B-1"); expect(dialog.textContent).toContain("DEUR-B R1");
  });

  it("requires a claimed reviewer from the Project snapshot for individual and bulk actions", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const projectBatch = { ...batch, reviewers: [
      { name: "Project reviewer one", email: "one@example.invalid" },
      { name: "Project reviewer two", email: "two@example.invalid" },
    ], items: batch.items.map((item, index) => ({ ...item, rentalReference: index === 1 ? "RENT-2" : "RENT-1" })) };
    const lookup = vi.fn().mockResolvedValue({ success: true, disposition: "AVAILABLE", value: projectBatch });
    const acknowledgeItem = vi.fn().mockResolvedValue({ success: true, disposition: "ACCEPTED", value: projectBatch });
    const acknowledgeItems = vi.fn().mockResolvedValue({ success: true, disposition: "ACCEPTED", value: projectBatch });
    const repository: PublicCustomerReviewBatchRepository = { lookup, acknowledgeItem, requestCorrection: vi.fn(), acknowledgeItems };
    const container = await render(repository);
    const individual = [...container.querySelectorAll("button")].find(button => button.textContent === "Acknowledge DEUR")!;
    await act(async () => individual.click());
    expect(acknowledgeItem).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Select your name from the Project reviewers");
    const select = container.querySelector<HTMLSelectElement>("#project-reviewer")!;
    await act(async () => { select.value = "two@example.invalid"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => individual.click());
    expect(acknowledgeItem).toHaveBeenCalledWith("opaque", "item-a", expect.objectContaining({ reviewerEmail: "two@example.invalid" }));
    const bulk = [...container.querySelectorAll("button")].find(button => button.textContent === "Acknowledge All Pending DEURs")!;
    await act(async () => bulk.click());
    expect(acknowledgeItems).toHaveBeenCalledWith("opaque", ["item-a", "item-b"], expect.objectContaining({ reviewerEmail: "two@example.invalid" }));
    expect(container.textContent).toContain("This shared link records the name you select");
    expect(container.textContent).toContain("RENT-2");
  });
});
