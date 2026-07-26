import { Link } from "react-router-dom";
import { developmentApprovalEmailOutbox } from "@/features/rental/approval-email/developmentApprovalEmailOutbox";

export default function DevelopmentEmailOutboxPage() {
  const emails = developmentApprovalEmailOutbox.getAll().sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  return <div className="p-6">
    <div className="mb-6"><h1 className="text-2xl font-semibold">Development Email Outbox</h1><p className="text-sm text-slate-500">Local approval-email previews only. No email provider is connected.</p></div>
    <div className="overflow-x-auto rounded border bg-white"><table className="w-full text-left text-sm"><thead><tr className="border-b bg-slate-50"><th className="p-3">Generated</th><th className="p-3">Recipient</th><th className="p-3">Subject</th><th className="p-3">Status</th><th className="p-3">Expiry</th><th className="p-3">Action</th></tr></thead><tbody>
      {emails.map((email) => <tr key={email.id} className="border-b"><td className="p-3">{new Date(email.generatedAt).toLocaleString()}</td><td className="p-3"><span className="block font-medium">{email.recipientName || "Manager"}</span><span>{email.recipient}</span></td><td className="p-3">{email.subject}</td><td className="p-3">{email.status}</td><td className="p-3">{new Date(email.expiresAt).toLocaleString()}</td><td className="p-3"><Link className="text-blue-700 underline" to={`/development-email-outbox/${email.id}`}>Open Preview</Link></td></tr>)}
      {emails.length === 0 && <tr><td className="p-6 text-center text-slate-500" colSpan={6}>No approval emails generated.</td></tr>}
    </tbody></table></div>
  </div>;
}
