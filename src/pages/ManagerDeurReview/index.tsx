import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  MANAGER_REVIEW_REASON_MAX_LENGTH,
  MANAGER_REVIEW_REASON_MIN_LENGTH,
  type ManagerDeurReviewSnapshot,
  type ManagerReviewRepository,
} from "@/features/rental/manager-review/managerReviewContracts";
import { createSupabaseManagerReviewRepository } from "@/integrations/supabase/SupabaseManagerReviewRepository";
import { buildPublicReviewIntervals } from "@/features/rental/customer-review/buildPublicReviewIntervals";
import { formatCustomerReviewDateTime } from "@/features/rental/customer-review/customerReviewDateTime";

function configuredRepository(): ManagerReviewRepository | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return url && publishableKey ? createSupabaseManagerReviewRepository({ url, publishableKey }) : undefined;
}

export default function ManagerDeurReviewPage({ repository = configuredRepository() }: {
  repository?: ManagerReviewRepository;
}) {
  const { credential = "" } = useParams();
  const [snapshot, setSnapshot] = useState<ManagerDeurReviewSnapshot>();
  const [state, setState] = useState<"loading" | "available" | "completed" | "unavailable">("loading");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const pendingRef = useRef(false);
  const actionIdentity = useMemo(() => ({
    commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(),
  }), []);

  useEffect(() => {
    let active = true;
    if (!repository || !credential) { setState("unavailable"); return; }
    void repository.getSnapshot(credential).then((result) => {
      if (!active) return;
      if (!result.success) { setState("unavailable"); return; }
      if (result.disposition === "ALREADY_COMPLETED") {
        setState("unavailable");
        return;
      }
      setSnapshot(result.value);
      setState("available");
    });
    return () => { active = false; };
  }, [credential, repository]);

  const complete = (text: string) => {
    setMessage(text);
    setState("completed");
    window.history.replaceState(null, "", "/review/manager/completed");
  };

  const run = async (action: "approve" | "reject" | "requestCorrection") => {
    if (!repository || pendingRef.current) return;
    const normalizedReason = reason.trim();
    if (action !== "approve" && normalizedReason.length < MANAGER_REVIEW_REASON_MIN_LENGTH) {
      setMessage(`Please provide at least ${MANAGER_REVIEW_REASON_MIN_LENGTH} characters explaining the decision.`);
      return;
    }
    const label = action === "approve" ? "approve" : action === "reject" ? "reject" : "request correction for";
    if (!window.confirm(`Confirm that you want to ${label} this submitted DEUR?`)) return;
    pendingRef.current = true;
    setPending(true);
    const result = action === "approve"
      ? await repository.approve(credential, actionIdentity)
      : await repository[action](credential, { ...actionIdentity, reason: normalizedReason });
    pendingRef.current = false;
    setPending(false);
    if (result.success || result.code === "ALREADY_COMPLETED") {
      complete(action === "approve"
        ? "The manager approval has been recorded."
        : action === "reject" ? "The manager rejection has been recorded."
          : "The manager correction request has been recorded.");
    } else {
      setMessage("This review link is unavailable or could not be processed.");
    }
  };

  if (state === "loading") return <Shell><p role="status">Loading secure manager review…</p></Shell>;
  if (state === "unavailable") return <Shell><h1 className="text-2xl font-bold">Review unavailable</h1><p>This link is invalid, expired, superseded, or no longer available.</p></Shell>;
  if (state === "completed" || !snapshot) return <Shell><h1 className="text-2xl font-bold">Review complete</h1><p role="status">{message}</p></Shell>;

  const intervals=buildPublicReviewIntervals(snapshot.timeline);
  return <Shell>
    <header><p className="text-sm font-medium text-blue-700">Secure manager review</p>
      <h1 className="text-2xl font-bold">Daily Equipment Utilization Report</h1>
      <p className="text-sm text-slate-600">This is an immutable read-only snapshot.</p></header>
    <section className="rounded-xl border bg-white p-5"><dl className="grid gap-3 sm:grid-cols-2">
      <Item label="Company" value={snapshot.companyName} /><Item label="Customer" value={snapshot.customerName} />
      <Item label="Rental" value={snapshot.rentalReference} /><Item label="Revision" value={snapshot.submittedRevision} />
      <Item label="Project" value={snapshot.project} /><Item label="Equipment" value={snapshot.equipment} />
      <Item label="Asset Number" value={snapshot.assetNumber} />
      <Item label="Operator" value={snapshot.operator} /><Item label="Work date" value={snapshot.workDate} />
      <Item label="Shift" value={snapshot.shift ?? "Not provided"} />
      <Item label="Shift Start" value={formatCustomerReviewDateTime(snapshot.shiftStart)} />
      <Item label="Shift End" value={formatCustomerReviewDateTime(snapshot.shiftEnd)} />
      <Item label="Opening meter" value={snapshot.openingMeter?.toString() ?? "Not applicable"} />
      <Item label="Closing meter" value={snapshot.closingMeter?.toString() ?? "Not applicable"} />
    </dl><div className="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-900"><b>Customer Review: Acknowledged</b><br/>Acknowledged at {formatCustomerReviewDateTime(snapshot.customerDecision.occurredAt)}</div><div className="mt-4 grid gap-2 rounded bg-slate-50 p-3 text-sm sm:grid-cols-4">
      <span>Operation: {snapshot.operationMinutes} min</span><span>Idle: {snapshot.idleMinutes} min</span>
      <span>Standby: {snapshot.standbyMinutes} min</span><span>Breakdown: {snapshot.breakdownMinutes} min</span>
    </div></section>
    <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Activity Timeline</h2>{snapshot.customerDecision&&<p className="mt-2 text-sm">Customer: {snapshot.customerDecision.action} at {formatCustomerReviewDateTime(snapshot.customerDecision.occurredAt)}{snapshot.customerDecision.reason?` — ${snapshot.customerDecision.reason}`:""}</p>}{intervals.length?<ol className="mt-3 space-y-3">{intervals.map(item=><li key={`${item.sequence}-${item.start}`}><b>{item.sequence}. {item.activity}</b><div className="text-sm">{item.idleReasonLabel&&<>Reason: {item.idleReasonLabel}<br/></>}Start: {formatCustomerReviewDateTime(item.start)}<br/>End: {formatCustomerReviewDateTime(item.end)}<br/>Duration: {item.durationSeconds} seconds{item.workDescription&&<><br/>Work: {item.workDescription}</>}{item.remarks&&<><br/>Remarks: {item.remarks}</>}</div></li>)}</ol>:<p className="mt-2 text-sm text-slate-600">No completed activity intervals were recorded.</p>}</section>
    <section className="space-y-4 rounded-xl border bg-white p-5">
      <button className="rounded bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-50"
        disabled={pending} onClick={() => void run("approve")}>{pending ? "Processing…" : "Approve"}</button>
      <div className="border-t pt-4"><label className="block text-sm font-medium" htmlFor="manager-reason">
        Reason for rejection or correction
      </label><textarea id="manager-reason" className="mt-1 block min-h-28 w-full rounded border p-2"
        maxLength={MANAGER_REVIEW_REASON_MAX_LENGTH} value={reason}
        onChange={(event) => setReason(event.target.value)} />
        <p className="mt-1 text-xs text-slate-500">{reason.length}/{MANAGER_REVIEW_REASON_MAX_LENGTH} characters</p>
        <div className="mt-3 flex gap-3"><button className="rounded border border-red-700 px-4 py-2 text-red-800 disabled:opacity-50"
          disabled={pending} onClick={() => void run("reject")}>Reject</button>
        <button className="rounded border border-amber-700 px-4 py-2 text-amber-800 disabled:opacity-50"
          disabled={pending} onClick={() => void run("requestCorrection")}>Request Correction</button></div>
      </div>
    </section>{message && <p role="status" className="rounded bg-blue-50 p-3 text-blue-900">{message}</p>}
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-3xl space-y-5 bg-slate-50 p-6 text-slate-900">{children}</main>;
}
function Item({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs uppercase text-slate-500">{label}</dt><dd>{value}</dd></div>;
}
