import { Link, useParams } from "react-router-dom";
import ManagerApprovalSnapshotView from "@/features/rental/approval-email/ManagerApprovalSnapshotView";
import { developmentApprovalEmailOutbox } from "@/features/rental/approval-email/developmentApprovalEmailOutbox";

export default function DevelopmentEmailPreviewPage() {
  const { id = "" } = useParams();
  const email = developmentApprovalEmailOutbox.getById(id);
  if (!email) return <div className="p-6">Approval email not found.</div>;
  return <div className="p-6"><div className="mb-6 rounded border bg-white p-5"><p className="text-sm text-slate-500">To: {email.recipientName || "Manager"} &lt;{email.recipient}&gt;</p><h1 className="mt-1 text-2xl font-semibold">{email.subject}</h1><p className="mt-2 text-sm">Generated {new Date(email.generatedAt).toLocaleString()} · Status {email.status}</p></div><div className="rounded border bg-white p-6"><h1 className="text-2xl font-semibold">Rental Approval Request</h1><p className="mt-2 mb-6">A Rental is awaiting your approval before equipment can be released.</p><ManagerApprovalSnapshotView snapshot={email.snapshot}/><div className="mt-8 flex gap-3"><Link className="rounded bg-green-700 px-5 py-3 font-semibold text-white" to={`/rental-approval/${email.approvalToken}`}>Approve Rental</Link><Link className="rounded bg-red-800 px-5 py-3 font-semibold text-white" to={`/rental-approval/${email.approvalToken}`}>Reject Rental</Link></div><div className="mt-8 border-t pt-4 text-sm text-slate-600"><p>This approval authorizes release eligibility only.</p><p>Equipment will still require release by the authorized release actor.</p><p className="font-semibold">Approval does NOT release equipment.</p></div></div></div>;
}
