import type { RentalWorkflowStage } from "@/features/rental/workflow/resolveRentalWorkflowStatus";
import type { WorkflowStep } from "@/components/ui/WorkflowStepper";

const STEP_DEFS = [
  { id: "prepare", label: "Prepare", stages: new Set<RentalWorkflowStage>(["Draft", "Reserved"]) },
  { id: "approve", label: "Approve", stages: new Set<RentalWorkflowStage>(["AwaitingManagerApproval", "ManagerRejected", "ApprovedForRelease"]) },
  { id: "release", label: "Release", stages: new Set<RentalWorkflowStage>(["Released"]) },
  { id: "operate", label: "Operate", stages: new Set<RentalWorkflowStage>(["Active", "DeurInProgress", "AwaitingCustomerAcknowledgement", "CustomerCorrectionRequested"]) },
  { id: "bill", label: "Bill", stages: new Set<RentalWorkflowStage>(["BillingEligible", "Billed"]) },
  { id: "close", label: "Close", stages: new Set<RentalWorkflowStage>(["Returned", "Closed"]) },
] as const;

const ORDER = STEP_DEFS.map((step) => step.id);

export function buildRentalWorkflowSteps(stage: RentalWorkflowStage): WorkflowStep[] {
  const currentIndex = STEP_DEFS.findIndex((step) => step.stages.has(stage));
  const resolvedIndex = currentIndex >= 0 ? currentIndex : 0;
  const blocked = stage === "ManagerRejected" || stage === "CustomerCorrectionRequested";

  return STEP_DEFS.map((step, index) => {
    let state: WorkflowStep["state"] = "upcoming";
    if (index < resolvedIndex || (stage === "Closed" && index < STEP_DEFS.length)) {
      state = stage === "Closed" || index < resolvedIndex ? "complete" : state;
    }
    if (index === resolvedIndex) state = blocked ? "blocked" : "current";
    if (stage === "Closed") state = "complete";
    return { id: step.id, label: step.label, state };
  });
}

export function workflowBannerTone(stage: RentalWorkflowStage): "info" | "success" | "warning" | "danger" {
  if (stage === "Closed" || stage === "Billed") return "success";
  if (stage === "ManagerRejected" || stage === "CustomerCorrectionRequested") return "danger";
  if (stage === "AwaitingManagerApproval" || stage === "AwaitingCustomerAcknowledgement") return "warning";
  return "info";
}

export function stepIndex(stage: RentalWorkflowStage): number {
  const index = ORDER.indexOf(STEP_DEFS.find((step) => step.stages.has(stage))?.id ?? "prepare");
  return index >= 0 ? index : 0;
}
