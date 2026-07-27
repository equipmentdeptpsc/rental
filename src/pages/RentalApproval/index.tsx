import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "@/components/ui/Button";
import { useAuth } from "@/features/auth/AuthContext";
import ManagerApprovalSnapshotView from "@/features/rental/approval-email/ManagerApprovalSnapshotView";
import { developmentApprovalEmailOutbox } from "@/features/rental/approval-email/developmentApprovalEmailOutbox";
import { useRental } from "@/features/rental/context/RentalContext";

export default function RentalApprovalPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { approveRental, rejectRental } = useRental();
  const email = developmentApprovalEmailOutbox.getByToken(token);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  if (!email) return <div className="p-6">Approval request not found.</div>;
  const actionable = email.status === "Pending" && new Date(email.expiresAt).getTime() > Date.now();
  function decide(decision: "Approved" | "Rejected") {
    const result = decision === "Approved" ? approveRental(email!.rentalId) : rejectRental(email!.rentalId, reason);
    if (!result.success) return setMessage(result.message ?? "Approval decision failed.");
    setMessage(`Rental ${decision.toLowerCase()} successfully.`);
    navigate(`/rentals/${email!.rentalId}/workspace`);
  }
  const canApprove = hasPermission("rental.approve");
  return <div className="p-6"><div className="mb-6"><h1 className="text-2xl font-semibold">Rental Approval Request</h1><p className="mt-1 text-slate-600">Review the same executive snapshot generated for the approval email.</p></div><div className="rounded border bg-white p-6"><ManagerApprovalSnapshotView snapshot={email.snapshot}/>{message && <p className="mt-5 rounded border p-3">{message}</p>}<div className="mt-8 border-t pt-5">{!canApprove && <p className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">Rental approval permission is required to decide this request.</p>}{!actionable && <p className="mb-4 rounded border p-3">This approval request is {email.status.toLowerCase()} and cannot be used again.</p>}<label className="block text-sm font-medium" htmlFor="rejection-reason">Rejection reason</label><textarea id="rejection-reason" className="mt-1 mb-4 w-full rounded border p-2" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required when rejecting"/><div className="flex gap-3"><Button disabled={!actionable || !canApprove} onClick={() => decide("Approved")}>Approve Rental</Button><Button variant="secondary" disabled={!actionable || !canApprove} onClick={() => decide("Rejected")}>Reject Rental</Button></div></div><div className="mt-8 border-t pt-4 text-sm text-slate-600"><p>This approval authorizes release eligibility only.</p><p>Equipment will still require release by the authorized release actor.</p><p className="font-semibold">Approval does NOT release equipment.</p></div></div></div>;
}
