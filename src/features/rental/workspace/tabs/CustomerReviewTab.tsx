import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRentalWorkspaceAggregate } from "../RentalWorkspaceProvider";
import type { ProjectReviewMonitoring } from "@/features/rental/customer-review/projectReviewMonitoring";
import { SupabaseProjectReviewMonitoringRepository } from "@/integrations/supabase/SupabaseProjectReviewMonitoringRepository";
import { getSupabaseBrowserClient } from "@/integrations/supabase/browserClient";
import { useAuth } from "@/features/auth/AuthContext";

export default function CustomerReviewTab() {
  const { rental } = useRentalWorkspaceAggregate();
  const { hasPermission } = useAuth();
  const [report, setReport] = useState<ProjectReviewMonitoring>();
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const repository = useMemo(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    return url && publishableKey
      ? new SupabaseProjectReviewMonitoringRepository(getSupabaseBrowserClient({ url, publishableKey }))
      : undefined;
  }, []);
  useEffect(() => {
    let active = true;
    if (!repository) { setError("Project Customer Review requires canonical remote access."); return; }
    setError(""); setReport(undefined);
    void repository.read(rental.id).then((value) => { if (active) setReport(value); })
      .catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : "Project Customer Review could not be loaded."); });
    return () => { active = false; };
  }, [repository, rental.id, refreshKey]);
  if (error) return <section className="app-card p-5" role="alert">{error}</section>;
  if (!report) return <section className="app-card p-5" role="status">Loading Project Customer Review…</section>;
  return <section className="space-y-5" aria-label="Project Customer Review monitoring">
    <header className="app-card space-y-2 p-5"><div className="flex justify-between gap-3"><h2 className="text-xl font-semibold">Project Customer Review</h2><button className="rounded border px-3 py-1" onClick={() => setRefreshKey(value => value + 1)}>Refresh</button></div>
      <p>Customer: {report.customerName} · Project: <Link className="text-blue-700 underline" to={hasPermission("project.manage") ? `/projects/${encodeURIComponent(report.projectId)}/edit` : "/projects"}>{report.projectName}</Link></p>
      <p>Configured reviewers: {report.configuredReviewers.length ? report.configuredReviewers.map(reviewer => `${reviewer.name} (${reviewer.email})`).join(", ") : "None — configure Project reviewers before submission."}</p></header>
    {report.batches.length === 0 ? <p className="app-card p-5">No Customer Review batches are associated with this Rental.</p> : report.batches.map(batch => {
      const counts = batch.items.reduce((acc, item) => {
        const key = item.reviewStatus === "Acknowledged" ? "approved" : item.reviewStatus === "CorrectionRequested" ? "corrections" : "pending";
        acc[key] += 1; return acc;
      }, { approved: 0, corrections: 0, pending: 0 });
      return <article className="app-card space-y-3 p-5" key={batch.batchId}>
        <h3 className="font-semibold">{batch.reviewDate} · {batch.businessTimezone} · {batch.scope} batch</h3>
        <p>{batch.supersededAt ? `Superseded ${batch.supersededAt}` : "Current batch"} · {counts.pending} pending · {counts.approved} approved · {counts.corrections} correction requested</p>
        <p>Recipient snapshot: {batch.recipientSnapshot.length ? batch.recipientSnapshot.map(reviewer => `${reviewer.name} (${reviewer.email})`).join(", ") : "Historical Rental recipient"}</p>
        <ul className="list-disc pl-5">{batch.notifications.map((notice, index) => <li key={`${notice.recipient}-${index}`}>{notice.recipient}: {notice.state}{notice.sentAt ? ` · sent ${notice.sentAt}` : ""}</li>)}</ul>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Rental</th><th>DEUR</th><th>Work date</th><th>Review</th><th>Submitted</th><th>Acknowledged</th></tr></thead><tbody>
          {batch.items.map((item, index) => <tr key={`${item.rentalLineId}-${index}`} className="border-t"><td><Link className="text-blue-700 underline" to={`/rentals/${encodeURIComponent(item.rentalId)}/workspace?tab=customer-review`}>{item.rentalId}</Link></td>
            <td>{item.deurId ? <Link className="text-blue-700 underline" to={`/rentals/${encodeURIComponent(item.rentalId)}/workspace?tab=deur`}>{item.deurNumber ?? item.deurId}</Link> : "In progress"}</td>
            <td>{item.workDate ?? "—"}</td><td>{item.reviewStatus}</td><td>{item.submittedAt ?? "—"}</td><td>{item.acknowledgedAt ?? "—"}</td></tr>)}</tbody></table></div>
      </article>;
    })}
  </section>;
}
