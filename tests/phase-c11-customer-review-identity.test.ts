// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { storage } from "@/core/storage";
import { DEVELOPMENT_CUSTOMER_REVIEW_OUTBOX_KEY, developmentCustomerReviewOutbox } from "@/features/rental/customer-review/developmentCustomerReviewOutbox";
import { DevelopmentOutboxPublicCustomerReviewRepository } from "@/features/rental/customer-review/DevelopmentOutboxPublicCustomerReviewRepository";
import CustomerDeurReviewPage from "@/pages/CustomerDeurReview";

const request = (deurId: string) => ({
  deurId, deurNumber: `DEUR-${deurId}`, revisionNumber: 1, rentalNumber: "RENT-1",
  customerName: "Customer", representativeName: "Representative", representativeEmail: "review@test.dev",
  snapshot: { project: "Project", equipment: `Equipment ${deurId}`, operator: "Operator", workDate: "2026-08-03", operationMinutes: 60, idleMinutes: 0, breakdownMinutes: 0, origin: "OPERATOR_DIGITAL" },
});

describe("Phase C11 local Customer review identity resolution", () => {
  const repository = new DevelopmentOutboxPublicCustomerReviewRepository();
  let root: Root | undefined;
  beforeEach(() => storage.remove(DEVELOPMENT_CUSTOMER_REVIEW_OUTBOX_KEY));
  afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; document.body.innerHTML = ""; });

  it("opens a generated review by its canonical token", async () => {
    const entry = developmentCustomerReviewOutbox.create(request("A"));
    await expect(repository.getSnapshot(entry.token)).resolves.toMatchObject({ success: true, disposition: "AVAILABLE", value: { rentalReference: "RENT-1", equipment: "Equipment A", submittedRevision: "R1" } });

    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const page = createElement(
      MemoryRouter,
      { initialEntries: [`/customer-deur-review/${entry.token}`] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/customer-deur-review/:deurId",
          element: createElement(CustomerDeurReviewPage),
        }),
      ),
    );
    await act(async () => root?.render(page));
    expect(container.textContent).toContain("Daily Equipment Utilization Report");
    expect(container.textContent).toContain("Equipment A");
    expect(container.textContent).not.toContain("Review unavailable");
  });

  it("denies expired, superseded, and invalid tokens", async () => {
    const expired = developmentCustomerReviewOutbox.create(request("expired"));
    storage.set(DEVELOPMENT_CUSTOMER_REVIEW_OUTBOX_KEY, developmentCustomerReviewOutbox.getAll().map((entry) => entry.id === expired.id ? { ...entry, expiresAt: "2000-01-01T00:00:00.000Z" } : entry));
    await expect(repository.getSnapshot(expired.token)).resolves.toEqual({ success: false, code: "EXPIRED" });

    storage.remove(DEVELOPMENT_CUSTOMER_REVIEW_OUTBOX_KEY);
    const original = developmentCustomerReviewOutbox.create(request("superseded"));
    developmentCustomerReviewOutbox.replace(original.id, request("superseded"));
    await expect(repository.getSnapshot(original.token)).resolves.toEqual({ success: false, code: "SUPERSEDED" });
    await expect(repository.getSnapshot("invalid-token")).resolves.toEqual({ success: false, code: "INVALID_OR_UNAVAILABLE" });
  });

  it("keeps two DEUR reviews from one Rental independently addressable", async () => {
    const first = developmentCustomerReviewOutbox.create(request("A"));
    const second = developmentCustomerReviewOutbox.create(request("B"));
    expect(first.id).not.toBe(second.id);
    expect(first.token).not.toBe(second.token);
    await expect(repository.getSnapshot(first.token)).resolves.toMatchObject({ success: true, value: { equipment: "Equipment A" } });
    await expect(repository.getSnapshot(second.token)).resolves.toMatchObject({ success: true, value: { equipment: "Equipment B" } });
  });
});
