import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast/ToastContext";
import { useAuth } from "@/features/auth/AuthContext";
import { useRental } from "../context/RentalContext";
import type { RentalRecord } from "../types";
import { deriveRentalQuickActions, visibleRentalQuickActions, type RentalQuickActionId } from "../quick-actions/rentalQuickActions";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { canUseCanonicalRemoteRentalMutations, canUseLegacyRentalMutations } from "../services/rentalRuntimeCapability";
import { requestCanonicalRentalRefresh } from "../remote/canonicalRentalRefresh";
import { getRentalApprovalStatus } from "../approval/rentalApproval";

export default function RentalQuickActions({ rental, hideClose = false }: { rental: RentalRecord; hideClose?: boolean }) {
  const { user, hasPermission } = useAuth();
  const { configuration, commandRepositories } = useApplicationDependenciesCompatibility();
  const legacyMutations = canUseLegacyRentalMutations(configuration);
  const canonicalMutations = canUseCanonicalRemoteRentalMutations(configuration) && Boolean(commandRepositories.canonicalRental);
  const mutationsAvailable = legacyMutations || canonicalMutations;
  const { transitionRental, returnRental, releaseRental, submitForApproval, approveRental, rejectRental, getReleaseReadiness } = useRental();
  const { showToast } = useToast(); const [pending, setPending] = useState<RentalQuickActionId>();
  const commandIdentity = useRef<Partial<Record<RentalQuickActionId, { commandId: string; idempotencyKey: string }>>>({});
  const permissions = { manage: hasPermission("rental.manage"), approve: hasPermission("rental.approval.decide"), submit: hasPermission("rental.approval.submit"), release: hasPermission("rental.release"), return: hasPermission("rental.return") };
  const approval = getRentalApprovalStatus(rental);
  const model = canonicalMutations
    ? rental.status === "Draft"
      ? approval === "Pending" ? { actions: permissions.approve ? [{ id: "approve" as const, label: "Approve Rental" }, { id: "reject" as const, label: "Reject Rental" }] : [], message: "Awaiting Manager Approval" }
        : approval === "Approved" ? { actions: permissions.manage ? [{ id: "reserve" as const, label: "Reserve Rental" }] : [], message: "Approved" }
          : { actions: permissions.submit ? [{ id: "submit" as const, label: approval === "Rejected" ? "Resubmit for Approval" : "Submit for Approval" }] : [], message: approval === "Rejected" ? rental.approvalDecisionRemarks ? `Rejected: ${rental.approvalDecisionRemarks}` : "Rejected" : undefined }
      : rental.status === "Reserved" ? { actions: permissions.release ? [{ id: "release" as const, label: "Release Equipment" }] : [], message: "Approved and reserved" }
        : { actions: [], message: undefined }
    : deriveRentalQuickActions(rental, permissions);
  async function run(id: RentalQuickActionId) {
    if (pending) return; setPending(id);
    if (canonicalMutations) {
      const expectedVersion = rental.rowVersion;
      if (typeof expectedVersion !== "number") { showToast("Canonical Rental version is unavailable. Refresh and try again.", "error"); setPending(undefined); return; }
      const identity = commandIdentity.current[id] ??= { commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
      const input = { ...identity, rentalId: rental.id, expectedVersion };
      const repository = commandRepositories.canonicalRental!;
      let result;
      if (id === "submit") result = await repository.submitApproval(input);
      else if (id === "approve") result = await repository.decideApproval({ ...input, decision: "Approved", remarks: window.prompt("Approval remarks (optional)") ?? undefined });
      else if (id === "reject") { const remarks = window.prompt("Rejection reason") ?? ""; result = remarks.trim() ? await repository.decideApproval({ ...input, decision: "Rejected", remarks }) : { success: false as const, code: "VALIDATION_REJECTED" as const, message: "A rejection reason is required." }; }
      else if (id === "reserve") result = await repository.reserve(input);
      else if (id === "release") result = await repository.release(input);
      else { showToast("This Rental action is not yet certified for remote use.", "error"); setPending(undefined); return; }
      if (result.success) { delete commandIdentity.current[id]; requestCanonicalRentalRefresh(); }
      showToast(result.success ? `${model.actions.find((item) => item.id === id)?.label ?? "Rental action"} completed.` : result.message, result.success ? "success" : "error"); setPending(undefined); return;
    }
    let result;
    if (id === "reserve") {
      const assigned = rental.status === "Draft" ? transitionRental(rental.id, "Assigned") : { success: true };
      result = assigned.success ? transitionRental(rental.id, "Reserved") : assigned;
    }
    else if (id === "submit") result = submitForApproval(rental.id);
    else if (id === "approve") result = approveRental(rental.id, window.prompt("Approval remarks (optional)") ?? "");
    else if (id === "reject") result = rejectRental(rental.id, window.prompt("Rejection reason") ?? "");
    else if (id === "release") result = releaseRental(rental.id, user?.name ?? "");
    else if (id === "activate") result = transitionRental(rental.id, "Active");
    else if (id === "return") result = returnRental(rental.id);
    else result = transitionRental(rental.id, "Closed");
    showToast(result.success ? `${model.actions.find((item) => item.id === id)?.label ?? "Rental action"} completed.` : result.message ?? "Rental action failed.", result.success ? "success" : "error"); setPending(undefined);
  }
  const canEditTerms = hasPermission("rental.commercialTerms.manage") && (legacyMutations ? ["Draft", "Assigned", "Reserved"].includes(rental.status) : rental.status === "Draft");
  const actions = visibleRentalQuickActions(model, hideClose).filter((action) => legacyMutations || ["submit", "approve", "reject", "reserve", "release"].includes(action.id));
  const releaseReady = canonicalMutations ? true : rental.status === "Reserved" ? getReleaseReadiness(rental.id).eligible : true;
  if (!mutationsAvailable) return null;
  return <div className="flex flex-wrap items-center gap-2">{model.message && <span className="text-sm text-slate-600">{model.message}</span>}{canEditTerms && <Link className="rounded border border-blue-600 px-3 py-2 text-sm font-medium text-blue-700" to={`/rentals/${rental.id}/commercial-terms`}>Edit Commercial Terms</Link>}{actions.map((action) => <Button key={action.id} variant="secondary" disabled={Boolean(pending) || (action.id === "release" && !releaseReady)} title={action.id === "release" && !releaseReady ? "Complete every DEUR release-readiness requirement first." : undefined} onClick={() => run(action.id)}>{pending === action.id ? "Working…" : action.label}</Button>)}</div>;
}
