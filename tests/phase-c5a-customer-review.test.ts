// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import CustomerDeurReviewPage from "@/pages/CustomerDeurReview";
import { SupabasePublicCustomerReviewRepository } from "@/integrations/supabase/SupabasePublicCustomerReviewRepository";
import type { PublicCustomerReviewRepository, PublicDeurReviewSnapshot } from "@/features/rental/customer-review/publicReviewContracts";

const migration = fs.readFileSync(
  path.resolve("supabase/migrations/20260729002600_phase_c5a_customer_review_quick_actions.sql"),
  "utf8",
);
const workItemMigration = fs.readFileSync(
  path.resolve("supabase/migrations/20260729002700_phase_c5a_correction_work_item_link.sql"),
  "utf8",
);

const snapshot: PublicDeurReviewSnapshot = {
  rentalReference: "R-UAT-C5A-1",
  customerName: "UAT Customer",
  project: "UAT Project",
  equipment: "EQ-1 - Excavator",
  operator: "UAT Operator",
  workDate: "2026-07-29",
  shift: "Day",
  operationMinutes: 360,
  idleMinutes: 30,
  standbyMinutes: 30,
  breakdownMinutes: 0,
  submittedRevision: "DEUR-UAT R1",
  timeline: [],
  reviewStatus: "Pending",
  availableActions: ["ACKNOWLEDGE", "REQUEST_CORRECTION"],
};

describe("Phase C5A migration contract", () => {
  it("exposes exactly the approved anonymous RPC surface and removes the legacy public action", () => {
    expect(migration).toContain("DROP FUNCTION public_reject_customer_review(jsonb)");
    expect(migration).toContain("public_request_customer_correction(jsonb)");
    expect(migration).toContain("TO anon;");
    expect(migration).not.toMatch(/GRANT EXECUTE[\s\S]*public_reject_customer_review/i);
    expect(migration).not.toContain("WHEN 'REJECT'");
    expect(migration).not.toContain("requested_action='REJECT'");
  });

  it("binds a hashed credential to recipient, actions, snapshot, and exact revision version", () => {
    expect(migration).toContain("extensions.gen_random_bytes(32)");
    expect(migration).toContain("extensions.digest(raw_token,'sha256')");
    expect(migration).toContain("recipient_destination");
    expect(migration).toContain("permitted_actions");
    expect(migration).toContain("revision_version");
    expect(migration).toContain("snapshot jsonb");
    const insertColumns = migration.match(/INSERT INTO customer_review_requests\(([\s\S]*?)\)\s*VALUES/);
    expect(insertColumns?.[1]).not.toContain("raw_token");
  });

  it("keeps customer evidence durable, tenant-bound, immutable, and directly inaccessible", () => {
    expect(migration).toContain("CREATE TABLE customer_review_outcomes");
    expect(migration).toContain("CREATE TABLE customer_correction_requests");
    expect(migration).toContain("customer_review_outcomes_immutable");
    expect(migration).toContain("customer_correction_source_immutable");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toMatch(/REVOKE ALL ON customer_review_outcomes,customer_correction_requests[\s\S]*FROM PUBLIC,anon,authenticated,service_role/);
  });

  it("uses explicit minimal paths and validates allowlisted public payloads", () => {
    expect(migration).not.toMatch(/SECURITY DEFINER SET search_path=[^;\n]*\bpublic\b/i);
    expect(migration).toContain("WHERE key NOT IN('commandId','idempotencyKey','deurId','rentalLineId','revisionId')");
    expect(migration).toContain("length(reason) NOT BETWEEN 10 AND 1000");
  });

  it("links the durable correction work item only when the canonical revision is inserted", () => {
    expect(workItemMigration).toContain("AFTER INSERT ON deurs");
    expect(workItemMigration).toContain("source_revision_id=NEW.previous_revision_id");
    expect(workItemMigration).toContain("resulting_revision_id=NEW.id");
    expect(workItemMigration).toContain("status='Open'");
    expect(workItemMigration).not.toMatch(/GRANT EXECUTE/i);
    expect(workItemMigration).not.toMatch(/SET search_path=[^;\n]*\bpublic\b/i);
  });
});

describe("provider-neutral public review adapter", () => {
  it("calls only approved wrappers and never forwards authoritative identities", async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: name === "get_public_customer_review"
        ? { success: true, disposition: "AVAILABLE", value: snapshot }
        : { success: true, disposition: "ACCEPTED", value: { reviewStatus: "Acknowledged" } },
      error: null,
    }));
    const repository = new SupabasePublicCustomerReviewRepository({
      schema: vi.fn(() => ({ rpc })),
    });
    await repository.getSnapshot("opaque");
    await repository.acknowledge("opaque", { commandId: "command", idempotencyKey: "key" });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "get_public_customer_review",
      "public_acknowledge_customer_review",
    ]);
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/companyId|userId|deurId|rentalId/);
  });

  it("trims correction evidence and maps transport failures safely", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { success: true, disposition: "ACCEPTED", value: { reviewStatus: "CorrectionRequested" } }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "sensitive transport detail" } });
    const repository = new SupabasePublicCustomerReviewRepository({ schema: vi.fn(() => ({ rpc })) });
    await expect(repository.requestCorrection("opaque", {
      commandId: "command",
      idempotencyKey: "key",
      reason: "  Incorrect operating duration.  ",
    })).resolves.toMatchObject({ success: true });
    expect(rpc.mock.calls[0][1].command.reason).toBe("Incorrect operating duration.");
    await expect(repository.getSnapshot("opaque")).resolves.toEqual({
      success: false,
      code: "TRANSPORT_FAILURE",
    });
  });
});

describe("minimal external review page", () => {
  let root: Root | undefined;
  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  async function render(repository: PublicCustomerReviewRepository) {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(createElement(
      MemoryRouter,
      { initialEntries: ["/review/deur/opaque"] },
      createElement(Routes, null, createElement(Route, {
        path: "/review/deur/:credential",
        element: createElement(CustomerDeurReviewPage, { repository }),
      })),
    )));
    return container;
  }

  it("renders only read-only review and the two approved customer actions", async () => {
    const repository: PublicCustomerReviewRepository = {
      getSnapshot: vi.fn().mockResolvedValue({ success: true, disposition: "AVAILABLE", value: snapshot }),
      acknowledge: vi.fn(),
      requestCorrection: vi.fn(),
    };
    const container = await render(repository);
    expect(container.textContent).toContain("Acknowledge");
    expect(container.textContent).toContain("Request Correction");
    expect(container.textContent).not.toContain("Reject");
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  });

  it("requires bounded correction evidence and disables duplicate submissions", async () => {
    let resolve!: (value: { success: true; disposition: "ACCEPTED"; value: { reviewStatus: "CorrectionRequested" } }) => void;
    const requestCorrection = vi.fn(() => new Promise<{ success: true; disposition: "ACCEPTED"; value: { reviewStatus: "CorrectionRequested" } }>((done) => { resolve = done; }));
    const value = { success: true as const, disposition: "ACCEPTED" as const, value: { reviewStatus: "CorrectionRequested" as const } };
    const repository: PublicCustomerReviewRepository = {
      getSnapshot: vi.fn().mockResolvedValue({ success: true, disposition: "AVAILABLE", value: snapshot }),
      acknowledge: vi.fn(),
      requestCorrection,
    };
    const container = await render(repository);
    const textarea = container.querySelector("textarea")!;
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "Request Correction")!;
    await act(async () => button.click());
    expect(requestCorrection).not.toHaveBeenCalled();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, "Incorrect operating duration.");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await act(async () => { button.click(); button.click(); });
    expect(requestCorrection).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    await act(async () => resolve(value));
    expect(container.textContent).toContain("recorded for Rental Operations");
    expect(window.location.pathname).not.toContain("opaque");
  });
});
