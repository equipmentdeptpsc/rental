import type { ManagerApprovalEmailSnapshot } from "./types";
import type { ReactNode } from "react";

const YesNo = ({ value }: { value: boolean }) => <span className={value ? "font-semibold text-green-700" : "font-semibold text-red-700"}>{value ? "YES" : "NO"}</span>;
const Money = ({ value, currency }: { value?: number; currency: string }) => <>{value === undefined ? "Not configured" : `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</>;

export default function ManagerApprovalSnapshotView({ snapshot }: { snapshot: ManagerApprovalEmailSnapshot }) {
  const details = [
    ["Rental Number", snapshot.rentalNumber], ["Customer", snapshot.customer], ["Project", snapshot.project],
    ["Rental Type", snapshot.rentalType], ["Rental Period", snapshot.rentalPeriod], ["Requested By", snapshot.requestedBy],
    ["Requested Date", new Date(snapshot.requestedDate).toLocaleString()], ["Current Status", snapshot.currentStatus], ["Approval Status", snapshot.approvalStatus],
  ];
  return <div className="space-y-6">
    <section><h2 className="text-lg font-semibold">Rental</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{details.map(([label, value]) => <div key={label} className="rounded border p-3"><dt className="text-xs uppercase text-slate-500">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl></section>
    <section><h2 className="text-lg font-semibold">Equipment</h2><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Equipment Code</th><th className="p-2">Equipment Name</th><th className="p-2">Asset Number</th><th className="p-2">Assigned Operator</th><th className="p-2">Quantity</th></tr></thead><tbody>{snapshot.equipment.map((item, index) => <tr className="border-b" key={`${item.equipmentCode}-${index}`}><td className="p-2">{item.equipmentCode}</td><td className="p-2">{item.equipmentName}</td><td className="p-2">{item.assetNumber}</td><td className="p-2">{item.assignedOperator}</td><td className="p-2">{item.quantity}</td></tr>)}</tbody></table></div></section>
    <section><h2 className="text-lg font-semibold">Commercial Summary</h2><div className="mt-3 space-y-3">{snapshot.commercial.map((item, index) => <div className="rounded border p-4" key={`${item.equipmentCode}-${index}`}><h3 className="font-semibold">{item.equipmentCode}</h3><dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"><Item label="Billing Method" value={item.billingMethod}/>{(item.summary ?? []).map((row) => <Item key={row.key} label={row.label} value={row.kind === "hours" ? `${row.value} hours` : <Money value={row.value} currency={item.currency}/>}/>) }<Item label="VAT Included" value={<YesNo value={item.vatIncluded}/>}/><Item label="Operator Included" value={<YesNo value={item.operatorIncluded}/>}/><Item label="Commercial Terms Configured" value={<YesNo value={item.commercialTermsConfigured}/>}/><Item label="Commercial Snapshot Locked" value={<YesNo value={item.commercialSnapshotLocked}/>}/></dl></div>)}</div></section>
    <section><h2 className="text-lg font-semibold">Operational Readiness</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Item label="Assignment Complete" value={<YesNo value={snapshot.readiness.assignmentComplete}/>}/><Item label="Commercial Terms Complete" value={<YesNo value={snapshot.readiness.commercialTermsComplete}/>}/><Item label="Equipment Available" value={<YesNo value={snapshot.readiness.equipmentAvailable}/>}/><Item label="Operator Assigned" value={<YesNo value={snapshot.readiness.operatorAssigned}/>}/><Item label="Conflicts Detected" value={<YesNo value={snapshot.readiness.conflictsDetected}/>}/><Item label="Expected Release Date" value={snapshot.readiness.expectedReleaseDate}/></dl></section>
    {snapshot.warnings.length > 0 && <section className="rounded border border-amber-300 bg-amber-50 p-4"><h2 className="font-semibold text-amber-900">Warnings</h2><ul className="mt-2 list-disc pl-5 text-sm text-amber-900">{snapshot.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></section>}
  </div>;
}

function Item({ label, value }: { label: string; value: ReactNode }) { return <div><dt className="text-xs uppercase text-slate-500">{label}</dt><dd className="mt-1">{value}</dd></div>; }
