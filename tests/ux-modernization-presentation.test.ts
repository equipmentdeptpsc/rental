import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import DashboardActionQueue from "@/features/dashboard/components/DashboardActionQueue";
import { buildDashboardActionQueue } from "@/features/dashboard/services/dashboardActionQueue";
import { buildRentalWorkflowSteps, workflowBannerTone } from "@/features/rental/workspace/presentation/rentalWorkflowPresentation";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import { LoadingState, ErrorState, EmptyDataState } from "@/components/ui/AsyncState";
import EmptyState from "@/components/ui/EmptyState";

describe("UX presentation helpers", () => {
  it("renders a responsive semantic page header with action hierarchy", () => {
    const markup = renderToStaticMarkup(createElement(PageHeader, { title: "Operations Dashboard", description: "Current work", actions: createElement("button", { type: "button" }, "Refresh") }));
    expect(markup).toContain('<h1 class="font-display">Operations Dashboard</h1>');
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

  it("provides shared loading, error, empty, and filter presentation", () => {
    const loading = renderToStaticMarkup(createElement(LoadingState, { label: "Loading Rentals" }));
    expect(loading).toContain('role="status"');
    expect(loading).toContain("Loading Rentals");
    const error = renderToStaticMarkup(createElement(ErrorState, { message: "Request failed", onRetry: () => undefined }));
    expect(error).toContain('role="alert"');
    expect(error).toContain("Retry");
    const empty = renderToStaticMarkup(createElement(EmptyDataState, { title: "No customers found" }));
    expect(empty).toContain("No customers found");
    const filters = renderToStaticMarkup(createElement(FilterBar, null, createElement("input", { "aria-label": "Search" })));
    expect(filters).toContain('aria-label="Filters"');
    expect(filters).toContain('aria-label="Search"');
  });

  it("supports compact intentional dashboard empty states", () => {
    const markup = renderToStaticMarkup(createElement(EmptyState, {
      className: "px-4 py-6",
      title: "No equipment category data yet",
      description: "Category insights will appear once equipment is added.",
    }));
    expect(markup).toContain("px-4 py-6");
    expect(markup).toContain("No equipment category data yet");
  });
});
