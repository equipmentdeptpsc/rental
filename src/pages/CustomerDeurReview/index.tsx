import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CUSTOMER_CORRECTION_REASON_MAX_LENGTH,
  CUSTOMER_CORRECTION_REASON_MIN_LENGTH,
  type PublicCustomerReviewRepository,
  type PublicDeurReviewSnapshot,
} from "@/features/rental/customer-review/publicReviewContracts";
import { createSupabasePublicCustomerReviewRepository } from "@/integrations/supabase/SupabasePublicCustomerReviewRepository";
import { formatCustomerReviewDateTime } from "@/features/rental/customer-review/customerReviewDateTime";
import { developmentOutboxPublicCustomerReviewRepository } from "@/features/rental/customer-review/DevelopmentOutboxPublicCustomerReviewRepository";

function configuredRepository(): PublicCustomerReviewRepository | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return undefined;
  return createSupabasePublicCustomerReviewRepository({ url, publishableKey });
}

export default function CustomerDeurReviewPage({
  repository,
}: {
  repository?: PublicCustomerReviewRepository;
}) {
  const { credential = "", deurId = "" } = useParams();
  const reviewCredential = credential || deurId;
  const reviewRepository = useMemo(
    () => repository ?? (credential ? configuredRepository() : developmentOutboxPublicCustomerReviewRepository),
    [credential, repository],
  );
  const [snapshot, setSnapshot] = useState<PublicDeurReviewSnapshot>();
  const [state, setState] = useState<"loading" | "available" | "completed" | "unavailable">("loading");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [message, setMessage] = useState("");
  const actionIdentity = useMemo(
    () => ({ commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
    [],
  );

  useEffect(() => {
    let active = true;
    if (!reviewRepository || !reviewCredential) {
      setState("unavailable");
      return;
    }
    void reviewRepository.getSnapshot(reviewCredential).then((result) => {
      if (!active) return;
      if (!result.success) {
        setState("unavailable");
        return;
      }
      if (result.disposition === "ALREADY_COMPLETED") {
        setState("unavailable");
        return;
      }
      setSnapshot(result.value);
      setState("available");
    });
    return () => { active = false; };
  }, [reviewRepository, reviewCredential]);

  const complete = (text: string) => {
    setMessage(text);
    setState("completed");
    window.history.replaceState(null, "", "/review/deur/completed");
  };

  const acknowledge = async () => {
    if (!reviewRepository || pendingRef.current || !window.confirm("Acknowledge this submitted DEUR?")) return;
    pendingRef.current = true;
    setPending(true);
    const result = await reviewRepository.acknowledge(reviewCredential, actionIdentity);
    pendingRef.current = false;
    setPending(false);
    if (result.success || result.code === "ALREADY_COMPLETED") {
      complete("Thank you. The DEUR acknowledgement has been recorded.");
    } else {
      setMessage("This review link is unavailable or could not be processed.");
    }
  };

  const requestCorrection = async () => {
    const normalizedReason = reason.trim();
    if (!reviewRepository || pendingRef.current || normalizedReason.length < CUSTOMER_CORRECTION_REASON_MIN_LENGTH) {
      setMessage(`Please provide at least ${CUSTOMER_CORRECTION_REASON_MIN_LENGTH} characters describing the correction.`);
      return;
    }
    pendingRef.current = true;
    setPending(true);
    const result = await reviewRepository.requestCorrection(reviewCredential, {
      ...actionIdentity,
      reason: normalizedReason,
    });
    pendingRef.current = false;
    setPending(false);
    if (result.success || result.code === "ALREADY_COMPLETED") {
      complete("Your correction request has been recorded for Rental Operations.");
    } else {
      setMessage("This review link is unavailable or could not be processed.");
    }
  };

  if (state === "loading") return <Shell><p role="status">Loading secure DEUR review…</p></Shell>;
  if (state === "unavailable") {
    return <Shell><h1 className="text-2xl font-bold">Review unavailable</h1><p>This link is invalid, expired, superseded, or no longer available.</p></Shell>;
  }
  if (state === "completed" || !snapshot) {
    return <Shell><h1 className="text-2xl font-bold">Review complete</h1><p role="status">{message}</p></Shell>;
  }

  return (
    <Shell>
      <header>
        <p className="text-sm font-medium text-blue-700">Secure customer review</p>
        <h1 className="text-2xl font-bold">Daily Equipment Utilization Report</h1>
        <p className="text-sm text-slate-600">Review the submitted record below. This page does not permit editing.</p>
      </header>
      <section className="rounded-xl border bg-white p-5">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item label="Rental" value={snapshot.rentalReference} />
          <Item label="Revision" value={snapshot.submittedRevision} />
          <Item label="Customer" value={snapshot.customerName} />
          <Item label="Project" value={snapshot.project} />
          <Item label="Equipment" value={snapshot.equipment} />
          <Item label="Operator" value={snapshot.operator} />
          <Item label="Work date" value={snapshot.workDate} />
          <Item label="Shift" value={snapshot.shift ?? "Not provided"} />
          <Item label="Shift start" value={formatCustomerReviewDateTime(snapshot.shiftStart)} />
          <Item label="Shift end" value={formatCustomerReviewDateTime(snapshot.shiftEnd)} />
          <Item label="Opening meter" value={snapshot.openingMeter?.toString() ?? "Not applicable"} />
          <Item label="Closing meter" value={snapshot.closingMeter?.toString() ?? "Not applicable"} />
        </dl>
        <div className="mt-4 grid gap-2 rounded bg-slate-50 p-3 text-sm sm:grid-cols-4">
          <span>Operation: {snapshot.operationMinutes} min</span>
          <span>Idle: {snapshot.idleMinutes} min</span>
          <span>Standby: {snapshot.standbyMinutes} min</span>
          <span>Breakdown: {snapshot.breakdownMinutes} min</span>
        </div>
      </section>
      <section className="space-y-4 rounded-xl border bg-white p-5">
        <button
          className="rounded bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-50"
          disabled={pending}
          onClick={() => void acknowledge()}
        >
          {pending ? "Processing…" : "Acknowledge"}
        </button>
        <div className="border-t pt-4">
          <label className="block text-sm font-medium" htmlFor="correction-reason">
            Describe the correction needed
          </label>
          <textarea
            id="correction-reason"
            className="mt-1 block min-h-28 w-full rounded border p-2"
            maxLength={CUSTOMER_CORRECTION_REASON_MAX_LENGTH}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            {reason.length}/{CUSTOMER_CORRECTION_REASON_MAX_LENGTH} characters
          </p>
          <button
            className="mt-3 rounded border border-amber-700 px-4 py-2 font-medium text-amber-800 disabled:opacity-50"
            disabled={pending}
            onClick={() => void requestCorrection()}
          >
            {pending ? "Processing…" : "Request Correction"}
          </button>
        </div>
      </section>
      {message && <p role="status" className="rounded bg-blue-50 p-3 text-blue-900">{message}</p>}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-3xl space-y-5 bg-slate-50 p-6 text-slate-900">{children}</main>;
}

function Item({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs uppercase text-slate-500">{label}</dt><dd>{value}</dd></div>;
}
