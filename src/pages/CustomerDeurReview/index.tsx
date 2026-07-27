import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useRental } from "@/features/rental/context/RentalContext";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { developmentCustomerReviewOutbox } from "@/features/rental/customer-review/developmentCustomerReviewOutbox";
import { formatCustomerReviewActivityRange, formatCustomerReviewDateTime } from "@/features/rental/customer-review/customerReviewDateTime";

export default function CustomerDeurReviewPage() {
  const { deurId = "" } = useParams();
  const request = developmentCustomerReviewOutbox.getByToken(deurId);
  const [version, setVersion] = useState(0);
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [message, setMessage] = useState("");
  const { rentals } = useRental();

  void version;

  if (!request) {
    return <main className="p-6">Customer review record was not found.</main>;
  }

  const deur = deurRepository.getById(request.deurId);
  const rental = rentals.find((item) => item.id === deur?.rentalId);
  if (!deur || !rental) {
    return <main className="p-6">Customer review record was not found.</main>;
  }

  const actor = {
    name: request.representativeName,
    email: request.representativeEmail,
  };

  const decide = (decision: "acknowledge" | "reject") => {
    if (request.status !== "Pending") {
      setMessage("This review request is expired or already consumed.");
      return;
    }

    const result =
      decision === "acknowledge"
        ? deurRepository.acknowledge(deur.id, actor, remarks)
        : deurRepository.reject(deur.id, actor, reason);

    if (result.success) {
      developmentCustomerReviewOutbox.decide(
        request.token,
        decision === "acknowledge" ? "Acknowledged" : "CorrectionRequested",
      );
    }

    setMessage(
      result.success
        ? decision === "acknowledge"
          ? "DEUR acknowledged. It is now eligible for Billing."
          : "Correction requested. Billing remains blocked."
        : result.message,
    );
    if (result.success) setVersion((value) => value + 1);
  };

  const snapshot = request.snapshot;
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-6">
      <header>
        <Link className="text-sm text-blue-700" to={`/rentals/${rental.id}/workspace`}>
          ← Rental Workspace
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Customer DEUR Review</h1>
        <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">
          UAT local review access. This is not a production-secure customer link.
        </p>
      </header>

      <section className="rounded-xl border bg-white p-5">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item label="DEUR" value={request.deurNumber} />
          <Item label="Revision" value={`R${request.revisionNumber}`} />
          <Item label="Rental" value={request.rentalNumber} />
          <Item label="Customer" value={request.customerName} />
          <Item label="Project" value={snapshot.project} />
          <Item label="Equipment" value={snapshot.equipment} />
          <Item label="Operator" value={snapshot.operator} />
          <Item label="Work Date" value={snapshot.workDate} />
          <Item label="Shift" value={snapshot.shift ?? "Not provided"} />
          <Item label="Work Description" value={snapshot.workDescription ?? "Not provided"} />
          <Item
            label="Submitted"
            value={formatCustomerReviewDateTime(snapshot.submittedAt)}
          />
          <Item label="Request Status" value={request.status} />
        </dl>
        <div className="mt-4 rounded bg-slate-50 p-3 text-sm">
          Operation: {snapshot.operationMinutes} min · Idle: {snapshot.idleMinutes} min · Standby:{" "}
          {snapshot.standbyMinutes ?? 0} min · Breakdown: {snapshot.breakdownMinutes} min
        </div>
        <div className="mt-4">
          <h2 className="font-semibold">Detailed Timeline</h2>
          {snapshot.timeline?.length ? (
            <ol className="mt-2 space-y-2">
              {snapshot.timeline.map((entry, index) => (
                <li className="rounded border p-3 text-sm" key={`${entry.start}-${index}`}>
                  <b>{entry.activityType ?? entry.label}</b>
                  <div>{formatCustomerReviewActivityRange(entry.start, entry.end)}</div>
                  <div>{entry.durationMinutes ?? 0} min{entry.remarks ? ` - ${entry.remarks}` : ""}</div>
                </li>
              ))}
            </ol>
          ) : <p className="mt-2 text-sm text-slate-600">Detailed activity timestamps were not recorded for this legacy DEUR.</p>}
        </div>
      </section>

      {deur.status === "Submitted" && request.status === "Pending" ? (
        <section className="space-y-3 rounded-xl border bg-white p-5">
          <label className="block text-sm">
            Acknowledgement remarks (optional)
            <textarea
              className="mt-1 block w-full rounded border p-2"
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
            />
          </label>
          <button
            className="rounded bg-emerald-700 px-4 py-2 font-medium text-white"
            onClick={() => decide("acknowledge")}
          >
            Acknowledge
          </button>
          <label className="block text-sm">
            Rejection / correction reason
            <textarea
              className="mt-1 block w-full rounded border p-2"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button
            className="rounded border border-red-600 px-4 py-2 font-medium text-red-700"
            onClick={() => decide("reject")}
          >
            Reject / Request Correction
          </button>
        </section>
      ) : (
        <p className="rounded bg-slate-100 p-4">
          This request is not awaiting a Customer decision. Request status: {request.status}; DEUR
          status: {deur.status}.
        </p>
      )}

      {message && (
        <p role="status" className="rounded bg-blue-50 p-3 text-blue-900">
          {message}
        </p>
      )}
    </main>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-slate-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
