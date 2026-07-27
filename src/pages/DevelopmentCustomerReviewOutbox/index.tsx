import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { developmentCustomerReviewOutbox, subscribeCustomerReviewOutbox } from "@/features/rental/customer-review/developmentCustomerReviewOutbox";

export default function DevelopmentCustomerReviewOutboxPage() {
  const [entries, setEntries] = useState(() => developmentCustomerReviewOutbox.getAll());
  useEffect(() => subscribeCustomerReviewOutbox(() => setEntries(developmentCustomerReviewOutbox.getAll())), []);
  return <main className="p-8">
    <h1 className="text-2xl font-bold">Development Customer Review Outbox</h1>
    <p className="text-amber-800">Local UAT email previews only.</p>
    {entries.length === 0
      ? <p className="mt-5 rounded border bg-white p-5">No Customer review requests have been generated.</p>
      : <div className="mt-5 space-y-3">{entries.map((entry) => <section className="rounded border bg-white p-4" key={entry.id}>
        <strong>{entry.deurNumber} R{entry.revisionNumber} · {entry.rentalNumber}</strong>
        <p>{entry.customerName} · {entry.representativeName} &lt;{entry.representativeEmail}&gt;</p>
        <p>{entry.status} · Generated {new Date(entry.generatedAt).toLocaleString()} · Expires {new Date(entry.expiresAt).toLocaleString()}</p>
        <div className="mt-2 flex gap-3">
          <Link className="text-blue-700" to={`/development-customer-review-outbox/${entry.id}`}>Preview</Link>
          <Link className="text-blue-700" to={`/customer-deur-review/${entry.token}`}>Open Review</Link>
        </div>
      </section>)}</div>}
  </main>;
}
