import type { RentalRecord } from "../types";
import type { DeurRecord } from "../deur/types";

export type RentalWorkflowStage = "Draft" | "Reserved" | "AwaitingManagerApproval" | "ManagerRejected" | "ApprovedForRelease" | "Released" | "Active" | "DeurInProgress" | "AwaitingCustomerAcknowledgement" | "CustomerCorrectionRequested" | "BillingEligible" | "Billed" | "Returned" | "Closed";

interface Input {
  rental: RentalRecord;
  effectiveDeur?: DeurRecord;
  effectiveDeurs?: DeurRecord[];
  commercialTermsAvailable: boolean;
  billableEvidence: boolean;
}

export function resolveRentalWorkflowStatus(input: Input) {
  const { rental } = input;
  const records = input.effectiveDeurs?.length ? input.effectiveDeurs : input.effectiveDeur ? [input.effectiveDeur] : [];
  const rejected = records.find((record) => record.status === "Rejected");
  const awaiting = records.find((record) => ["Submitted", "Pending Acknowledgement"].includes(record.status));
  const inProgress = records.find((record) => ["Draft", "In Progress"].includes(record.status));
  const allBilled = records.length > 0 && records.every((record) => record.status === "Billed" || record.billingLocked);
  const allAcknowledged = records.length > 0 && records.every((record) => ["Acknowledged", "Billed"].includes(record.status));
  let stage: RentalWorkflowStage, label = "", explanation = "", nextAction = "", blockingReasons: string[] = [];

  if (rental.status === "Closed") { stage = "Closed"; label = "Closed"; explanation = "Rental workflow is complete."; nextAction = "None"; }
  else if (rental.status === "Returned") { stage = "Returned"; label = "Returned"; explanation = "Equipment has been returned."; nextAction = "Close Rental"; }
  else if (rejected) { stage = "CustomerCorrectionRequested"; label = "Customer Correction Requested"; explanation = rejected.rejectionReason ?? "The Customer requested a correction."; nextAction = "Correct DEUR and resubmit"; }
  else if (awaiting) { stage = "AwaitingCustomerAcknowledgement"; label = "Awaiting Customer Acknowledgement"; explanation = "One or more submitted DEURs require a Customer decision."; nextAction = "Send or open Customer review request"; }
  else if (inProgress) { stage = "DeurInProgress"; label = "DEUR In Progress"; explanation = "Daily operational evidence is being recorded."; nextAction = "Complete and submit DEUR"; }
  else if (allBilled) { stage = "Billed"; label = "Billed"; explanation = "All effective DEURs have been consumed by Billing."; nextAction = "Review Billing Statement"; }
  else if (allAcknowledged && input.commercialTermsAvailable && input.billableEvidence) { stage = "BillingEligible"; label = "Billing Eligible"; explanation = "All effective DEURs are acknowledged with Commercial Terms and billable evidence."; nextAction = "Generate Billing"; }
  else if (rental.status === "Active") { stage = "Active"; label = "Active"; explanation = "Rental operations are active."; nextAction = "Record DEUR"; }
  else if (rental.status === "Released") { stage = "Released"; label = "Released"; explanation = "Equipment has been released."; nextAction = "Activate Rental"; }
  else if (rental.approvalStatus === "Pending") { stage = "AwaitingManagerApproval"; label = "Awaiting Manager Approval"; explanation = "Manager approval is pending."; nextAction = "Manager approves or rejects"; }
  else if (rental.approvalStatus === "Rejected") { stage = "ManagerRejected"; label = "Manager Rejected"; explanation = rental.approvalDecisionRemarks ?? "Manager rejected the Rental."; nextAction = "Revise and resubmit"; }
  else if (rental.approvalStatus === "Approved") { stage = "ApprovedForRelease"; label = "Approved for Release"; explanation = "Manager approval authorizes release eligibility."; nextAction = "Release Equipment"; }
  else if (rental.status === "Reserved") { stage = "Reserved"; label = "Reserved"; explanation = "Rental preparation is complete."; nextAction = "Send to Approver"; }
  else { stage = "Draft"; label = "Draft"; explanation = "Rental is in draft preparation."; nextAction = "Submit for approval when preparation is complete"; }

  if (allAcknowledged && !input.commercialTermsAvailable) blockingReasons.push("Commercial Terms are unavailable for one or more effective Rental Equipment Lines.");
  if (allAcknowledged && !input.billableEvidence) blockingReasons.push("One or more acknowledged DEURs have no calculable billable evidence.");
  return { stage, label, explanation, recommendedNextAction: nextAction, blockingReasons };
}
