// @vitest-environment jsdom
import { act, createElement } from "react";
import { readFileSync } from "node:fs";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ManagerDeurReviewPage from "@/pages/ManagerDeurReview";
import { SupabaseManagerReviewRepository } from "@/integrations/supabase/SupabaseManagerReviewRepository";
import type { ManagerReviewRepository } from "@/features/rental/manager-review/managerReviewContracts";

const migration = readFileSync(
  "supabase/migrations/20260730002800_phase_c5b_manager_review_quick_actions.sql",
  "utf8",
);

describe("Phase C5B secure manager review", () => {
  it("keeps manager and customer action boundaries separate", () => {
    expect(migration).toContain("CHECK(action IN('APPROVE','REJECT','REQUEST_CORRECTION'))");
    expect(migration).not.toMatch(/public_(approve|reject)_customer_review/);
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION");
    expect(migration).toContain("TO anon");
    expect(migration).not.toMatch(/GRANT EXECUTE[\\s\\S]*decide_manager_review\\(jsonb,text\\)/);
  });

  it("hashes opaque tokens and does not persist raw credentials or internal IDs in snapshots", () => {
    expect(migration).toContain("extensions.digest(raw_token,'sha256')");
    expect(migration).not.toMatch(/raw_token text[^]*CREATE TABLE/);
    const snapshot = migration.slice(migration.indexOf("review_snapshot=jsonb_build_object"), migration.indexOf("raw_token="));
    expect(snapshot).not.toContain("'equipment',line.equipment_id");
    expect(snapshot).not.toContain("'operator',line.operator_id");
  });

  it("keeps explicit search paths and immutable evidence", () => {
    expect(migration).not.toMatch(/CREATE FUNCTION[^]*?\\$\\$;(?![\\s\\S]*?SET search_path)/);
    expect(migration).toContain("manager_review_outcomes_immutable");
    expect(migration).toContain("manager correction source evidence is immutable");
    expect(migration).toContain("REVOKE ALL ON manager_review_requests");
  });

  it("maps only the three manager RPC actions", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { success: true, disposition: "ACCEPTED", value: { reviewStatus: "Approved" } },
      error: null,
    });
    const repository = new SupabaseManagerReviewRepository({ schema: () => ({ rpc }) });
    await repository.approve("opaque", { commandId: "c", idempotencyKey: "i" });
    await repository.reject("opaque", { commandId: "c2", idempotencyKey: "i2", reason: "valid reason" });
    await repository.requestCorrection("opaque", { commandId: "c3", idempotencyKey: "i3", reason: "valid reason" });
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      "approve_manager_review", "reject_manager_review", "request_manager_correction",
    ]);
  });

  it("renders a read-only manager snapshot with all three actions", async () => {
    const repository: ManagerReviewRepository = {
      getSnapshot: vi.fn().mockResolvedValue({ success: true, disposition: "AVAILABLE", value: {
        rentalReference: "R-1", project: "Safe project", equipment: "EQ-1 - Excavator",
        operator: "Operator", workDate: "2026-07-30", submittedRevision: "D-1 R1",
        operationMinutes: 60, idleMinutes: 10, standbyMinutes: 5, breakdownMinutes: 0,
        correctionHistory: [], reviewHistory: [], billingEligible: false,
        reviewStatus: "Pending", availableActions: ["APPROVE", "REJECT", "REQUEST_CORRECTION"],
      } }),
      approve: vi.fn(), reject: vi.fn(), requestCorrection: vi.fn(),
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ["/review/manager/opaque"] },
      createElement(Routes, null, createElement(Route, {
        path: "/review/manager/:credential", element: createElement(ManagerDeurReviewPage, { repository }),
      })))));
    expect(container.textContent).toContain("Safe project");
    expect([...container.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "Approve", "Reject", "Request Correction",
    ]);
    await act(async () => root.unmount());
    container.remove();
  });
});
