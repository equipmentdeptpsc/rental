import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import DashboardActionQueue from "@/features/dashboard/components/DashboardActionQueue";
import { buildDashboardActionQueue } from "@/features/dashboard/services/dashboardActionQueue";
import { buildRentalWorkflowSteps, workflowBannerTone } from "@/features/rental/workspace/presentation/rentalWorkflowPresentation";
import PageHeader from "@/components/ui/PageHeader";

describe("UX presentation helpers", () => {
  it("renders a responsive semantic page header with action hierarchy", () => {
    const markup = renderToStaticMarkup(createElement(PageHeader, { title: "Operations Dashboard", description: "Current work", actions: createElement("button", { type: "button" }, "Refresh") }));
    expect(markup).toContain("<h1>Operations Dashboard</h1>");
    expect(markup).toContain("Current work");
    expect(markup).toContain("Refresh");
    expect(markup).toContain("flex-wrap");
  });

  it("builds dashboard action queue items from pending operational signals", () => {
    const items = buildDashboardActionQueue({
      deurs: [
        { status: "In Progress" } as never,
        { status: "Rejected", revision: undefined } as never,
      ],
      rentals: [],
      pendingManagerApprovals: 2,
      pendingCustomerAcknowledgements: 1,
      expectedReturns: 3,
    });
    expect(items.some((item) => item.id === "deur-missing")).toBe(true);
    expect(items.some((item) => item.id === "manager-approval")).toBe(true);
    expect(items.some((item) => item.id === "expected-returns")).toBe(true);
    expect(items.every((item) => item.permission === "rental.read")).toBe(true);

    const denied = renderToStaticMarkup(createElement(
      MemoryRouter,
      null,
      createElement(DashboardActionQueue, { items, hasPermission: () => false }),
    ));
    expect(denied).not.toContain('href="/rentals');

    const allowed = renderToStaticMarkup(createElement(
      MemoryRouter,
      null,
      createElement(DashboardActionQueue, { items, hasPermission: (permission) => permission === "rental.read" }),
    ));
    expect(allowed).toContain('href="/rentals');
  });

  it("maps rental workflow stages to stepper and banner tones", () => {
    const steps = buildRentalWorkflowSteps("DeurInProgress");
    expect(steps.find((step) => step.id === "operate")?.state).toBe("current");
    expect(workflowBannerTone("ManagerRejected")).toBe("danger");
    expect(workflowBannerTone("Closed")).toBe("success");
  });
});
