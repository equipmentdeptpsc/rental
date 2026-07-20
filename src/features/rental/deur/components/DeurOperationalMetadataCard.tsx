import type { DeurCreationSource, DeurOperationalMetadataSnapshot, DeurTotals, ManualDeurMetadata } from "../types";

interface Props { metadata?: DeurOperationalMetadataSnapshot; remarks?: string; creationSource?:DeurCreationSource; manualMetadata?:ManualDeurMetadata; totals?:DeurTotals }

export default function DeurOperationalMetadataCard({ metadata, remarks, creationSource, manualMetadata, totals }: Props) {
  if (metadata === undefined) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Operational metadata not captured for this legacy DEUR</div>;
  }
  const label = (value: typeof metadata.costCode) => value ? `${value.code} — ${value.name}` : undefined;
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      {creationSource==="OPERATOR_DIGITAL"&&<div className="mb-3"><strong>DIGITAL DEUR</strong><p className="text-sm text-slate-500">Created by Operator</p></div>}
      {creationSource==="RENTAL_COMPANY_MANUAL"&&<div className="mb-3"><strong>MANUALLY ENCODED BY RENTAL COMPANY ADMIN</strong><dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2"><div><dt>Source</dt><dd>Physical DEUR Form</dd></div><div><dt>Reason</dt><dd>{manualMetadata?.reason.replaceAll("_"," ")}</dd></div><div><dt>Physical DEUR Reference</dt><dd>{manualMetadata?.physicalDeurReference}</dd></div><div><dt>Encoded By</dt><dd>{manualMetadata?.encodedByName}</dd></div><div><dt>Encoded At</dt><dd>{manualMetadata?.encodedAt}</dd></div><div><dt>Operator Confirmed</dt><dd>{manualMetadata?.operatorConfirmed?"Yes":"No"}</dd></div><div><dt>Meal Break (non-billable)</dt><dd>{totals?.mealBreakMinutes??0} minutes</dd></div><div><dt>Breakdown (non-billable)</dt><dd>{totals?.breakdownMinutes??0} minutes</dd></div></dl></div>}
      {!creationSource&&<p className="mb-3 text-sm text-amber-700">Creation source not captured</p>}
      <h3 className="font-semibold">Operational Metadata at DEUR Creation</h3>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-slate-500">Activity Code</dt><dd>{label(metadata.activityCode) ?? "Activity Code not captured on Rental"}</dd></div>
        <div><dt className="text-slate-500">Cost Code</dt><dd>{label(metadata.costCode) ?? "Cost Code not captured on Rental"}</dd></div>
        <div><dt className="text-slate-500">Work Description</dt><dd>{metadata.workDescription?.name ?? "Work Description not captured"}</dd></div>
      </dl>
      {remarks && <p className="mt-3 text-sm"><span className="text-slate-500">Remarks: </span>{remarks}</p>}
      {metadata.workDescription?.requiresRemarks && !remarks && <p className="mt-3 text-sm text-amber-700">Remarks required for this Work Description</p>}
    </section>
  );
}
