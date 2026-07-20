import type { DeurBillingPreview } from "@/features/rental/deur/billing/createDeurBillingPreview";
import { mapDeurBillingPreviewCharges } from "@/features/rental/deur/billing/mapDeurBillingPreviewCharges";

interface Props { preview?: DeurBillingPreview; currency?: string }
const statusLabel: Record<DeurBillingPreview["status"], string> = {
  available: "Final preview", provisional: "Live estimate", "not-calculable": "Not calculable", ineligible: "Ineligible",
};
const reasonMessage: Partial<Record<DeurBillingPreview["eligibility"]["reasonCodes"][number], string>> = {
  BILLING_LOCKED: "This DEUR is locked for billing.", ALREADY_BILLED: "This DEUR has already been included in billing.",
  REJECTED: "Rejected DEUR records cannot be previewed for billing.", LEGACY_RECORD: "Legacy DEUR evidence is not supported.",
  RECORD_NOT_CANONICAL: "Canonical DEUR activity evidence is required.", INVALID_EVENT_HISTORY: "The DEUR activity history is invalid.",
  UNSUPPORTED_BILLING_EVIDENCE: "The billing method requires evidence that is not recorded in this DEUR.",
};

function money(value: number, currency: string): string {
  const safe = Number.isFinite(value) ? Object.is(value, -0) ? 0 : value : 0;
  try { return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(safe); }
  catch { return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(safe); }
}

export default function BillingPreviewPanel({ preview, currency = "PHP" }: Props) {
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm sm:p-6" aria-label="Billing preview">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Billing Preview</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          {preview ? statusLabel[preview.status] : "Not calculable"}
        </span>
      </div>
      {!preview ? (
        <p className="mt-4 text-sm text-amber-700">Billing configuration is not available for this rental.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div><div className="text-slate-500">Billing method</div><div className="font-semibold">{preview.billingMethod}</div></div>
            <div><div className="text-slate-500">{preview.quantity ? "Quantity" : "Operating evidence"}</div><div className="font-semibold">{preview.quantity ? `${preview.quantity.value.toFixed(preview.quantity.unit === "trip" ? 0 : 2)} ${preview.quantity.unit === "trip" && preview.quantity.value !== 1 ? "trips" : preview.quantity.unit}` : `${(preview.evidence.operatingMinutes / 60).toFixed(2)} hours`}</div></div>
            <div><div className="text-slate-500">Calculated</div><div className="font-semibold">{new Date(preview.calculatedAt).toLocaleString()}</div></div>
          </div>
          <div className="mt-3 text-sm"><span className="text-slate-500">Commercial terms source</span><div className="font-semibold">{preview.commercialTermsSource === "IMMUTABLE_SNAPSHOT" ? "Immutable Rental Snapshot" : "Current Rental Terms — Legacy Record"}</div></div>
          {preview.quantity && preview.charges?.unitRate !== undefined && (
            <div className="mt-3 text-sm"><span className="text-slate-500">Unit rate</span><div className="font-semibold">{money(preview.charges.unitRate, currency)} / {preview.quantity.unit}</div></div>
          )}
          {preview.charges && (
            <dl className="mt-5 divide-y rounded-lg border">
              {mapDeurBillingPreviewCharges(preview.charges).map((row) => (
                <div key={row.key} className={`flex items-center justify-between px-4 py-2 text-sm ${row.key === "grandTotal" ? "font-bold" : ""}`}>
                  <dt>{row.label}</dt><dd>{money(row.amount, currency)}</dd>
                </div>
              ))}
            </dl>
          )}
          {(preview.issues.length > 0 || preview.status === "ineligible") && (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-700">
              {preview.issues.map((issue) => <li key={`${issue.code}:${issue.field ?? ""}`}>{issue.message}</li>)}
              {preview.issues.length === 0 && preview.eligibility.reasonCodes.map((code) => <li key={code}>{reasonMessage[code] ?? "This DEUR is not eligible for billing preview."}</li>)}
            </ul>
          )}
          {preview.disclaimer && <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{preview.disclaimer}</p>}
        </>
      )}
    </section>
  );
}
