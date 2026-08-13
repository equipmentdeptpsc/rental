import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { buildPublicReviewIntervals } from "@/features/rental/customer-review/buildPublicReviewIntervals";
import { formatCustomerReviewDateTime } from "@/features/rental/customer-review/customerReviewDateTime";
import {
  CUSTOMER_CORRECTION_REASON_MAX_LENGTH,
  CUSTOMER_CORRECTION_REASON_MIN_LENGTH,
} from "@/features/rental/customer-review/publicReviewContracts";
import type {
  PublicCustomerReviewBatch,
  PublicCustomerReviewBatchItem,
  PublicCustomerReviewBatchRepository,
} from "@/features/rental/customer-review/publicGroupedReviewContracts";
import { createSupabasePublicCustomerReviewBatchRepository } from "@/integrations/supabase/SupabasePublicCustomerReviewBatchRepository";

function configuredRepository(): PublicCustomerReviewBatchRepository | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return url && publishableKey ? createSupabasePublicCustomerReviewBatchRepository({ url, publishableKey }) : undefined;
}

export default function GroupedCustomerReviewPage({ repository }: { repository?: PublicCustomerReviewBatchRepository }) {
  const { credential = "" } = useParams();
  const reviewRepository = useMemo(() => repository ?? configuredRepository(), [repository]);
  const [batch, setBatch] = useState<PublicCustomerReviewBatch>();
  const [state, setState] = useState<"loading" | "available" | "unavailable">("loading");
  const [pendingItem, setPendingItem] = useState<string>();
  const [correctionItem, setCorrectionItem] = useState<PublicCustomerReviewBatchItem>();
  const [remarks, setRemarks] = useState("");
  const [message, setMessage] = useState("");
  const pendingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!reviewRepository || !credential) { setState("unavailable"); return; }
    const result = await reviewRepository.lookup(credential);
    if (!result.success) { setState("unavailable"); return; }
    setBatch(result.value);
    setState("available");
  }, [credential, reviewRepository]);

  useEffect(() => { void refresh(); }, [refresh]);

  const identity = () => ({ commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() });
  const acknowledge = async (item: PublicCustomerReviewBatchItem) => {
    if (!reviewRepository || pendingRef.current || !window.confirm(`Acknowledge ${item.deurNumber ?? "this DEUR"}?`)) return;
    pendingRef.current = true; setPendingItem(item.publicItemId); setMessage("");
    const result = await reviewRepository.acknowledgeItem(credential, item.publicItemId, identity());
    pendingRef.current = false; setPendingItem(undefined);
    if (!result.success && result.code !== "ALREADY_COMPLETED") { setMessage("This line could not be acknowledged."); return; }
    setMessage("The DEUR acknowledgement has been recorded.");
    await refresh();
  };
  const submitCorrection = async () => {
    const reason = remarks.trim();
    if (!reviewRepository || !correctionItem || pendingRef.current || reason.length < CUSTOMER_CORRECTION_REASON_MIN_LENGTH) {
      setMessage(`Please provide at least ${CUSTOMER_CORRECTION_REASON_MIN_LENGTH} characters describing the correction.`); return;
    }
    pendingRef.current = true; setPendingItem(correctionItem.publicItemId); setMessage("");
    const result = await reviewRepository.requestCorrection(credential, correctionItem.publicItemId, reason, identity());
    pendingRef.current = false; setPendingItem(undefined);
    if (!result.success && result.code !== "ALREADY_COMPLETED") { setMessage("This correction request could not be recorded."); return; }
    setCorrectionItem(undefined); setRemarks(""); setMessage("The correction request has been recorded.");
    await refresh();
  };

  if (state === "loading") return <Shell><p role="status">Loading secure grouped review…</p></Shell>;
  if (state === "unavailable" || !batch) return <Shell><h1 className="text-2xl font-bold">Review unavailable</h1><p>This link is invalid, expired, superseded, or unavailable.</p></Shell>;
  return <Shell>
    <header className="space-y-2"><p className="text-sm font-medium text-blue-700">Secure grouped customer review</p><h1 className="text-2xl font-bold">Daily Equipment Utilization Reports</h1>
      <dl className="grid gap-2 rounded-xl border bg-white p-5 sm:grid-cols-2"><Item label="Company" value={batch.company}/><Item label="Customer" value={batch.customer}/><Item label="Project" value={batch.project}/><Item label="Rental" value={batch.rental}/><Item label="Review date" value={batch.displayDate}/><Item label="Status" value={batch.batchStatus.replaceAll("_", " ")}/></dl>
    </header>
    <section aria-label="Review summary" className="grid gap-3 sm:grid-cols-4">
      <Summary label="Awaiting Acknowledgement" value={batch.actionableCount}/><Summary label="In Progress" value={batch.inProgressCount}/><Summary label="Acknowledged" value={batch.acknowledgedCount}/><Summary label="Correction Requested" value={batch.correctionRequestedCount}/>
    </section>
    <section className="space-y-5" aria-label="Equipment lines">{batch.items.map(item => <ReviewLine key={item.publicItemId} item={item} pending={pendingItem === item.publicItemId} onAcknowledge={() => void acknowledge(item)} onCorrection={() => { setCorrectionItem(item); setRemarks(""); setMessage(""); }}/>)}</section>
    {correctionItem && <section role="dialog" aria-label="Request line correction" className="rounded-xl border-2 border-amber-600 bg-white p-5"><h2 className="text-lg font-bold">Request correction</h2><p>{correctionItem.equipmentName} · {correctionItem.assetNumber} · {correctionItem.deurNumber} {correctionItem.revisionLabel}</p><label className="mt-3 block text-sm font-medium" htmlFor="grouped-correction-remarks">Correction remarks</label><textarea id="grouped-correction-remarks" className="mt-1 min-h-28 w-full rounded border p-2" maxLength={CUSTOMER_CORRECTION_REASON_MAX_LENGTH} value={remarks} onChange={event => setRemarks(event.target.value)}/><div className="mt-3 flex gap-3"><button className="rounded bg-amber-700 px-4 py-3 font-bold text-white disabled:opacity-50" disabled={Boolean(pendingItem)} onClick={() => void submitCorrection()}>Submit Correction Request</button><button className="rounded border px-4 py-3" disabled={Boolean(pendingItem)} onClick={() => setCorrectionItem(undefined)}>Cancel</button></div></section>}
    {message && <p role="status" className="rounded bg-blue-50 p-3 text-blue-900">{message}</p>}
  </Shell>;
}

function ReviewLine({ item, pending, onAcknowledge, onCorrection }: { item: PublicCustomerReviewBatchItem; pending: boolean; onAcknowledge(): void; onCorrection(): void }) {
  const intervals = buildPublicReviewIntervals(item.timeline ?? []);
  return <article className="space-y-4 rounded-xl border bg-white p-5"><header className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-bold">{item.equipmentName}</h2><p className="text-sm text-slate-600">Asset {item.assetNumber} · {item.operator ?? "Operator pending"}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold">{item.reviewState.replaceAll("_", " ")}</span></header>
    <dl className="grid gap-2 sm:grid-cols-3"><Item label="DEUR / revision" value={[item.deurNumber, item.revisionLabel].filter(Boolean).join(" ") || "In progress"}/><Item label="Work date" value={item.workDate ?? "Not available"}/><Item label="Shift" value={item.shift ?? "Not available"}/><Item label="Shift start" value={formatCustomerReviewDateTime(item.shiftStart)}/><Item label="Shift end" value={formatCustomerReviewDateTime(item.shiftEnd)}/><Item label="Meter" value={item.openingMeter === undefined ? "Not applicable" : `${item.openingMeter} – ${item.closingMeter ?? "In progress"}`}/></dl>
    <div className="grid gap-2 rounded bg-slate-50 p-3 text-sm sm:grid-cols-4"><span>Operation: {item.operationMinutes ?? 0} min</span><span>Idle: {item.idleMinutes ?? 0} min</span><span>Standby: {item.standbyMinutes ?? 0} min</span><span>Breakdown: {item.breakdownMinutes ?? 0} min</span></div>
    <div><h3 className="font-semibold">Activity Timeline</h3>{intervals.length ? <ol className="mt-2 space-y-2">{intervals.map(entry => <li key={`${entry.sequence}-${entry.start}`} className="text-sm"><b>{entry.sequence}. {entry.activity}</b><br/>{formatCustomerReviewDateTime(entry.start)} – {formatCustomerReviewDateTime(entry.end)}</li>)}</ol> : <p className="text-sm text-slate-600">No completed activity intervals are available.</p>}</div>
    {item.availableActions.length > 0 && <div className="flex flex-col gap-3 sm:flex-row"><button className="min-h-12 rounded-lg bg-emerald-700 px-6 py-3 font-bold text-white disabled:opacity-50" disabled={pending} onClick={onAcknowledge}>{pending ? "Processing…" : "Acknowledge DEUR"}</button><button className="min-h-12 rounded-lg border-2 border-amber-700 px-6 py-3 font-bold text-amber-800 disabled:opacity-50" disabled={pending} onClick={onCorrection}>Request Correction</button></div>}
  </article>;
}
function Shell({ children }: { children: React.ReactNode }) { return <main className="mx-auto min-h-screen max-w-5xl space-y-6 bg-slate-50 p-6 text-slate-900">{children}</main>; }
function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs uppercase text-slate-500">{label}</dt><dd>{value}</dd></div>; }
function Summary({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border bg-white p-4"><div className="text-2xl font-bold">{value}</div><div className="text-sm text-slate-600">{label}</div></div>; }
