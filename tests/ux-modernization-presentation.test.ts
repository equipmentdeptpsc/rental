import { describe, expect, it } from "vitest";
import { buildDashboardActionQueue } from "@/features/dashboard/services/dashboardActionQueue";
import { buildRentalWorkflowSteps, workflowBannerTone } from "@/features/rental/workspace/presentation/rentalWorkflowPresentation";

describe("UX presentation helpers", () => {
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
  });

  it("maps rental workflow stages to stepper and banner tones", () => {
    const steps = buildRentalWorkflowSteps("DeurInProgress");
    expect(steps.find((step) => step.id === "operate")?.state).toBe("current");
    expect(workflowBannerTone("ManagerRejected")).toBe("danger");
    expect(workflowBannerTone("Closed")).toBe("success");
  });
});
