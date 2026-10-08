import { useRef, useState } from "react";
import { useAuth } from "@/features/auth/AuthContext";
import { useManagementReads } from "@/features/dashboard/hooks/useManagementReads";
import { getSupabaseBrowserClient } from "@/integrations/supabase/browserClient";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export default function ManagementBillingApprovals() {
  const { hasPermission } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyId, setBusyId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const commandIdentity = useRef(new Map<string, { commandId: string; idempotencyKey: string }>());
  const today = new Date().toISOString().slice(0, 10);
  const { approvals } = useManagementReads({ from: today, to: today }, "previous", refreshKey, false, hasPermission("rental.approval.decide"));
  const approve = async (id: string, expectedVersion: number) => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publishableKey || !hasPermission("billing.approve")) return;
    setBusyId(id); setMessage(undefined);
    try {
      const client = getSupabaseBrowserClient({ url, publishableKey });
      const identity = commandIdentity.current.get(id) ?? { commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
      commandIdentity.current.set(id, identity);
      const { data, error } = await client.schema("erp").rpc("command_finalize_billing_statement", {
        command: { statementId: id, expectedVersion, ...identity },
      });
      const result = data as { success?: boolean; message?: string } | null;
      if (error || result?.success !== true) throw new Error(result?.message || error?.message || "Billing approval could not be completed.");
      setMessage("Billing statement approved.");
      commandIdentity.current.delete(id);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Billing approval could not be completed.");
    } finally { setBusyId(undefined); }
  };
  return <section className="app-card p-5" aria-label="Billing statement approvals">
    <h2 className="app-section-title">Billing statement approvals</h2>
    <p className="app-muted mb-3">Review prepared statement totals before approving customer delivery.</p>
    {approvals.status === "loading" && !approvals.data && <p role="status">Loading approvals…</p>}
    {approvals.status === "error" && <p role="alert">Billing approvals are unavailable. <button className="app-link" onClick={() => setRefreshKey((value) => value + 1)}>Retry</button></p>}
    {approvals.data?.billingItems.length === 0 && <p className="app-muted">No billing statements are awaiting approval.</p>}
    {message && <p role="status" className="mb-3 text-sm">{message}</p>}
    <div className="space-y-2">{approvals.data?.billingItems.map((item) => <article className="rounded-lg border p-3 text-sm" key={item.id}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><strong>{item.statement_no}</strong><p>{item.customer_snapshot} · {item.project_snapshot}</p><p className="text-xs text-slate-500">{item.billing_from} to {item.billing_to} · {item.line_count} line(s)</p></div><div className="flex items-center gap-3"><strong>{money.format(Number(item.grand_total))}</strong>{hasPermission("billing.approve") && <button className="rounded-lg bg-blue-600 px-3 py-2 font-medium text-white" disabled={Boolean(busyId) || item.line_count > item.lines.length} onClick={() => void approve(item.id, item.row_version)}>{busyId === item.id ? "Approving…" : "Approve statement"}</button>}</div></div>
      <details className="mt-2 text-xs"><summary className="cursor-pointer text-blue-700">Review statement lines</summary><div className="mt-2 space-y-1">{item.lines.map((line, index) => <div key={`${line.workDate}-${index}`} className="flex justify-between gap-3"><span>{line.workDate} · {line.description}</span><strong>{money.format(Number(line.amount))}</strong></div>)}</div>{item.line_count > item.lines.length && <p className="app-muted">Only the first 100 of {item.line_count} lines are shown. This statement requires a full review before approval.</p>}</details>
    </article>)}</div>
    {approvals.data && approvals.data.billingCount > approvals.data.billingItems.length && <p className="app-muted mt-3">Showing 20 most recent of {approvals.data.billingCount} pending statements.</p>}
  </section>;
}
