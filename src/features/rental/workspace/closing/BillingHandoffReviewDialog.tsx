import type { BillingHandoffReview } from "@/features/rental/billingstatement/services/executeRentalBillingHandoff";
import { mapDeurBillingPreviewCharges } from "@/features/rental/deur/billing/mapDeurBillingPreviewCharges";

interface Props { open: boolean; review: BillingHandoffReview; currency: string; loading: boolean; onConfirm(): void; onCancel(): void }
function money(value: number, currency: string) {
  const safe = Number.isFinite(value) && !Object.is(value, -0) ? value : 0;
  try { return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(safe); }
  catch { return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(safe); }
}

export default function BillingHandoffReviewDialog({ open, review, currency, loading, onConfirm, onCancel }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Billing handoff review">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold">Review Billing and Close Rental</h2>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><span className="text-slate-500">Rental</span><div className="font-semibold">{review.rentalReference}</div></div>
          <div><span className="text-slate-500">Selected DEUR</span><div className="font-semibold">{review.deurReference}</div></div>
          <div><span className="text-slate-500">Billing method</span><div className="font-semibold">{review.billingMethod}</div></div>
          <div><span className="text-slate-500">Eligibility</span><div className="font-semibold text-green-700">Confirmed</div></div>
          <div><span className="text-slate-500">Commercial terms</span><div className="font-semibold">{review.commercialTermsSource === "IMMUTABLE_SNAPSHOT" ? "Immutable Rental Snapshot" : "Current Rental Terms — Legacy Record"}</div></div>
        </div>
        {review.charges.billingQuantity !== undefined && review.charges.billingUnit && (
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><span className="text-slate-500">Quantity</span><div className="font-semibold">{review.charges.billingQuantity} {review.charges.billingUnit === "KILOMETER" ? "km" : review.charges.billingUnit === "CUBIC_METER" ? "m³" : review.charges.billingQuantity === 1 ? "trip" : "trips"}</div></div>
            <div><span className="text-slate-500">Unit rate</span><div className="font-semibold">{money(review.charges.unitRate ?? 0, currency)} / {review.charges.billingUnit === "KILOMETER" ? "km" : review.charges.billingUnit === "CUBIC_METER" ? "m³" : "trip"}</div></div>
          </div>
        )}
        <dl className="mt-5 divide-y rounded-lg border">
          {mapDeurBillingPreviewCharges(review.charges).map((row) => (
            <div key={row.key} className={`flex justify-between px-4 py-2 text-sm ${row.key === "grandTotal" ? "font-bold" : ""}`}>
              <dt>{row.label}</dt><dd>{money(row.amount, currency)}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-700">
          <li>A billing statement will be created.</li>
          <li>The selected DEUR will be marked consumed and cannot be billed again.</li>
          <li>The rental will close only after billing succeeds.</li>
        </ul>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" disabled={loading} onClick={onCancel} className="rounded border px-4 py-2 text-sm disabled:opacity-50">Cancel</button>
          <button type="button" disabled={loading} onClick={onConfirm} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {loading ? "Creating statement..." : "Create Billing Statement and Close Rental"}
          </button>
        </div>
      </div>
    </div>
  );
}
