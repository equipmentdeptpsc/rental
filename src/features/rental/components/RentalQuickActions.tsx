import { useState } from "react";
import { Link } from "react-router-dom";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast/ToastContext";
import { useAuth } from "@/features/auth/AuthContext";
import { useRental } from "../context/RentalContext";
import type { RentalRecord } from "../types";
import { deriveRentalQuickActions, visibleRentalQuickActions, type RentalQuickActionId } from "../quick-actions/rentalQuickActions";

export default function RentalQuickActions({ rental, hideClose = false }: { rental: RentalRecord; hideClose?: boolean }) {
  const { user, hasPermission } = useAuth();
  const { transitionRental, returnRental, releaseRental, submitForApproval, approveRental, rejectRental, getReleaseReadiness } = useRental();
  const { showToast } = useToast(); const [pending, setPending] = useState<RentalQuickActionId>();
  const model = deriveRentalQuickActions(rental, { manage: hasPermission("rental.manage"), approve: hasPermission("rental.approval.decide"), submit: hasPermission("rental.approval.submit"), release: hasPermission("rental.release"), return: hasPermission("rental.return") });
  function run(id: RentalQuickActionId) {
    if (pending) return; setPending(id); let result;
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
  const canEditTerms = hasPermission("rental.commercialTerms.manage") && ["Draft", "Assigned", "Reserved"].includes(rental.status);
  const actions = visibleRentalQuickActions(model, hideClose); const releaseReady = rental.status === "Reserved" ? getReleaseReadiness(rental.id).eligible : true;
  return <div className="flex flex-wrap items-center gap-2">{model.message && <span className="text-sm text-slate-600">{model.message}</span>}{canEditTerms && <Link className="rounded border border-blue-600 px-3 py-2 text-sm font-medium text-blue-700" to={`/rentals/${rental.id}/commercial-terms`}>Edit Commercial Terms</Link>}{actions.map((action) => <Button key={action.id} variant="secondary" disabled={Boolean(pending) || (action.id === "release" && !releaseReady)} title={action.id === "release" && !releaseReady ? "Complete every DEUR release-readiness requirement first." : undefined} onClick={() => run(action.id)}>{pending === action.id ? "Working…" : action.label}</Button>)}</div>;
}
