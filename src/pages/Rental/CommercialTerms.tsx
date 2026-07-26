import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast/ToastContext";
import { useRental } from "@/features/rental/context/RentalContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { rentalBillingMethods, type RentalBillingMethod, type RentalRecord } from "@/features/rental/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { RentalContractRecord } from "@/features/rental/types/RentalContract";
import { canEditRentalCommercialTerms, type RentalCommercialTermsInput } from "@/features/rental/services/configureRentalCommercialTerms";

const optionalNumber = (value: string) => value.trim() === "" ? undefined : Number(value);
export const commercialRateLabel=(method:RentalBillingMethod)=>({
  "Per Hour":"Operating Rate","Per Day":"Daily Rate","Per Week":"Weekly Rate","Per Month":"Monthly Rate",
  "Per Trip":"Trip Rate","Per Kilometer":"Kilometer Rate","Per Cubic Meter":"Cubic Meter Rate","One Lot":"Contract Amount",
})[method];

export function LineTermsEditor({ rental, line, contract, equipmentLabel, operatorLabel, saveTerms }: {
  rental: RentalRecord; line: RentalEquipmentLine; contract?: RentalContractRecord; equipmentLabel: string; operatorLabel: string;
  saveTerms: (input: RentalCommercialTermsInput) => { success: boolean; message?: string };
}) {
  const editable = canEditRentalCommercialTerms(rental) && !line.commercialSnapshot;
  const [billingMethod, setBillingMethod] = useState<RentalBillingMethod>(contract?.billingMethod ?? rental.billingMethod ?? "Per Hour");
  const [currency, setCurrency] = useState(contract?.currency ?? "PHP");
  const [unitRate, setUnitRate] = useState(contract ? String(contract.unitRate) : "");
  const [minimumBillableHours, setMinimumBillableHours] = useState(contract?.minimumBillableHours?.toString() ?? "");
  const [overtimeRate, setOvertimeRate] = useState(contract?.overtimeRate?.toString() ?? "");
  const [standbyRate, setStandbyRate] = useState(contract?.standbyRate?.toString() ?? "");
  const [mobilizationFee, setMobilizationFee] = useState(contract?.mobilizationFee?.toString() ?? "");
  const [demobilizationFee, setDemobilizationFee] = useState(contract?.demobilizationFee?.toString() ?? "");
  const [fuelCharge, setFuelCharge] = useState(contract?.fuelCharge?.toString() ?? "");
  const [operatorIncluded, setOperatorIncluded] = useState(contract?.operatorIncluded ?? rental.rentalType === "Operated Rental");
  const [operatorRate, setOperatorRate] = useState(contract?.operatorRate?.toString() ?? "");
  const [contractAmount, setContractAmount] = useState(contract?.contractAmount?.toString() ?? "");
  const [taxRate, setTaxRate] = useState(contract?.taxRate?.toString() ?? "");
  const [withholdingTax, setWithholdingTax] = useState(contract?.withholdingTax?.toString() ?? "");
  const [relationship, setRelationship] = useState<RentalCommercialTermsInput["transactionRelationship"]>(contract?.transactionRelationship ?? rental.transactionRelationship ?? "Non-Affiliate");
  const [vatApplicability, setVatApplicability] = useState<RentalCommercialTermsInput["vatApplicability"]>(contract?.vatApplicability ?? rental.billingTerms?.vatApplicability ?? "Applicable");
  const [remarks, setRemarks] = useState(contract?.remarks ?? "");
  const [includeMinimum,setIncludeMinimum]=useState(contract?.minimumBillableHours!==undefined);
  const [includeOvertime,setIncludeOvertime]=useState(contract?.overtimeRate!==undefined);
  const [includeStandby,setIncludeStandby]=useState(contract?.standbyRate!==undefined);
  const [includeMobilization,setIncludeMobilization]=useState(contract?.mobilizationFee!==undefined);
  const [includeDemobilization,setIncludeDemobilization]=useState(contract?.demobilizationFee!==undefined);
  const [includeFuel,setIncludeFuel]=useState(contract?.fuelCharge!==undefined);
  const [saving, setSaving] = useState(false); const [saveError, setSaveError] = useState(""); const submissionPending = useRef(false);
  async function save() {
    if (submissionPending.current) return;
    if(["Pending","Approved"].includes(rental.approvalStatus??"")&&!window.confirm("Saving material Commercial Terms changes will invalidate the current Manager approval request or approval. Continue?"))return;
    submissionPending.current = true; setSaving(true); setSaveError("");
    const result = await Promise.resolve(saveTerms({ billingMethod, currency, unitRate: billingMethod==="One Lot"?0:Number(unitRate), minimumBillableHours: includeMinimum?optionalNumber(minimumBillableHours):undefined, overtimeRate: includeOvertime?optionalNumber(overtimeRate):undefined, standbyRate: includeStandby?optionalNumber(standbyRate):undefined, mobilizationFee: includeMobilization?optionalNumber(mobilizationFee):undefined, demobilizationFee: includeDemobilization?optionalNumber(demobilizationFee):undefined, fuelCharge: includeFuel?optionalNumber(fuelCharge):undefined, operatorIncluded, operatorRate: operatorIncluded?undefined:optionalNumber(operatorRate), contractAmount: billingMethod==="One Lot"?optionalNumber(contractAmount):undefined, taxRate: vatApplicability==="Applicable"?optionalNumber(taxRate):undefined, withholdingTax: optionalNumber(withholdingTax), transactionRelationship: relationship, vatApplicability, remarks }));
    if (!result.success) { submissionPending.current = false; setSaving(false); setSaveError(result.message ?? "Unable to save commercial terms."); }
  }
  const numberField = (label: string, value: string, setValue: (value: string) => void, required = false) => <label className="text-sm">{label}<input className="mt-1 block w-full rounded border p-2" type="number" min="0" step="any" required={required} disabled={!editable} value={value} onChange={(event) => setValue(event.target.value)} /></label>;
  return <section className="rounded-xl border bg-white p-6 shadow-sm">
    <div className="mb-4 rounded-lg bg-slate-50 p-4"><p className="font-semibold">{equipmentLabel}</p><p className="text-sm text-slate-600">Operator: {operatorLabel}</p><p className="text-xs text-slate-500">Rental Equipment Line · {line.status}</p></div>
    {!editable && <p className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-blue-800">Commercial terms are read-only.</p>}
    {editable&&["Pending","Approved"].includes(rental.approvalStatus??"")&&<p className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">Saving a material change will invalidate the current Manager approval state and require a new approval request.</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm">Billing Method<select className="mt-1 block w-full rounded border p-2" disabled={!editable} value={billingMethod} onChange={(event) => setBillingMethod(event.target.value as RentalBillingMethod)}>{rentalBillingMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
      <label className="text-sm">Currency<input className="mt-1 block w-full rounded border p-2" disabled={!editable} value={currency} onChange={(event) => setCurrency(event.target.value)} /></label>
      {billingMethod!=="One Lot"&&numberField(commercialRateLabel(billingMethod), unitRate, setUnitRate, true)}
      {billingMethod==="One Lot"&&numberField("Contract Amount", contractAmount, setContractAmount, true)}
      <label className="text-sm">Relationship<select className="mt-1 block w-full rounded border p-2" disabled={!editable} value={relationship} onChange={(event) => setRelationship(event.target.value as typeof relationship)}><option>Non-Affiliate</option><option>Affiliate</option></select></label>
      <label className="text-sm">VAT<select className="mt-1 block w-full rounded border p-2" disabled={!editable} value={vatApplicability} onChange={(event) => setVatApplicability(event.target.value as typeof vatApplicability)}><option>Applicable</option><option>Not Applicable</option></select></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={includeMinimum} onChange={e=>setIncludeMinimum(e.target.checked)}/> Apply Minimum Billable Hours</label>{includeMinimum&&numberField("Minimum Billable Hours",minimumBillableHours,setMinimumBillableHours)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={includeOvertime} onChange={e=>setIncludeOvertime(e.target.checked)}/> Include Overtime</label>{includeOvertime&&numberField("Overtime Rate",overtimeRate,setOvertimeRate)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={includeStandby} onChange={e=>setIncludeStandby(e.target.checked)}/> Include Standby</label>{includeStandby&&numberField("Standby Rate",standbyRate,setStandbyRate)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={includeMobilization} onChange={e=>setIncludeMobilization(e.target.checked)}/> Include Mobilization</label>{includeMobilization&&numberField("Mobilization Fee",mobilizationFee,setMobilizationFee)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={includeDemobilization} onChange={e=>setIncludeDemobilization(e.target.checked)}/> Include Demobilization</label>{includeDemobilization&&numberField("Demobilization Fee",demobilizationFee,setDemobilizationFee)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={includeFuel} onChange={e=>setIncludeFuel(e.target.checked)}/> Include Fuel Charge</label>{includeFuel&&numberField("Fuel Charge",fuelCharge,setFuelCharge)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={operatorIncluded} onChange={(event) => setOperatorIncluded(event.target.checked)} /> Operator Included</label>
      {!operatorIncluded&&numberField("Operator Rate",operatorRate,setOperatorRate)}
      {vatApplicability==="Applicable"&&numberField("Tax Rate (%)",taxRate,setTaxRate)}
      {numberField("Withholding Tax (%)",withholdingTax,setWithholdingTax)}
      <label className="sm:col-span-2 text-sm">Remarks<textarea className="mt-1 block w-full rounded border p-2" disabled={!editable} value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label>
    </div>
    {saveError && <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{saveError}</p>}
    {editable && <div className="mt-6 flex justify-end"><Button type="button" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save This Line"}</Button></div>}
  </section>;
}

export default function RentalCommercialTermsPage() {
  const { rentalId = "" } = useParams(); const { showToast } = useToast();
  const { getRental, rentalEquipmentLines, getContractForRentalEquipmentLine, saveCommercialTermsForRentalEquipmentLine, addRentalEquipmentLine, removeRentalEquipmentLine } = useRental();
  const { equipment } = useEquipment(); const { operators } = useOperator(); const { assignments } = useAssignment();
  const rental = getRental(rentalId); const lines = rentalEquipmentLines.filter((line) => line.rentalId === rentalId);
  const [selectedId, setSelectedId] = useState(lines[0]?.id ?? ""); const selected = lines.find((line) => line.id === selectedId) ?? lines[0];
  if (!rental) return <div className="p-8">Rental not found.</div>;
  const editable = canEditRentalCommercialTerms(rental);
  const incompleteLines = lines.filter((line) => !getContractForRentalEquipmentLine(line.id) && !line.commercialSnapshot); const allConfigured = lines.length > 0 && incompleteLines.length === 0;
  const availableAssignments = assignments.filter((assignment) => assignment.status === "Active" && assignment.projectId === rental.projectId && !lines.some((line) => line.equipmentId === assignment.equipmentId));
  return <div className="mx-auto max-w-5xl space-y-6 p-6">
    <header><Link className="text-sm text-blue-700" to={`/rentals/${rentalId}/workspace`}>← Rental Workspace</Link><h1 className="mt-2 text-3xl font-bold">Commercial Terms by Equipment</h1><p className="mt-2 text-slate-600">{rental.rentalNumber ?? rental.id}</p></header>
    <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Equipment Lines</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{lines.map((line) => { const machine = equipment.find((item) => item.id === line.equipmentId); const complete = Boolean(getContractForRentalEquipmentLine(line.id) || line.commercialSnapshot); return <button type="button" key={line.id} onClick={() => setSelectedId(line.id)} className={`rounded-lg border p-3 text-left ${selected?.id === line.id ? "border-blue-500 bg-blue-50" : ""}`}><strong>{machine ? `${machine.assetNo} - ${machine.equipmentName}` : line.equipmentId}</strong><span className={`ml-2 text-xs ${complete ? "text-green-700" : "text-amber-700"}`}>{complete ? "Complete" : "Incomplete"}</span><p className="text-xs text-slate-500">{getContractForRentalEquipmentLine(line.id)?.billingMethod ?? "Terms not configured"} · {line.status}</p></button>; })}</div>
      {editable && availableAssignments.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{availableAssignments.map((assignment) => <Button key={assignment.id} type="button" onClick={() => { const result = addRentalEquipmentLine(rentalId, { equipmentId: assignment.equipmentId, operatorId: assignment.operatorId, assignmentId: assignment.id }); showToast(result.success ? "Equipment line added." : result.message ?? "Unable to add line.", result.success ? "success" : "error"); }}>Add {equipment.find((item) => item.id === assignment.equipmentId)?.assetNo ?? assignment.equipmentId}</Button>)}</div>}
      {editable && selected && <button aria-label="Remove Selected Line" className="mt-4 rounded border border-red-600 bg-white px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50" type="button" onClick={() => { if(getContractForRentalEquipmentLine(selected.id)&&!window.confirm("Remove this equipment line and its saved Commercial Terms?"))return; const removedId=selected.id; const result = removeRentalEquipmentLine(rentalId, removedId); if (!result.success) { showToast(result.message ?? "Unable to remove line.", "error"); return; } setSelectedId(lines.find((line) => line.id !== removedId)?.id ?? ""); showToast("Equipment line removed.", "success"); }}>Remove selected line</button>}
    </section>
    {allConfigured && <section className="rounded-xl border border-green-300 bg-green-50 p-4"><h2 className="font-semibold text-green-900">Commercial terms complete</h2><p className="mt-1 text-sm text-green-800">Every equipment line is configured. Review the terms or continue the Rental workflow.</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" className="rounded border border-green-700 px-4 py-2 text-sm text-green-800" onClick={() => setSelectedId(lines[0].id)}>Review Commercial Terms</button><Link className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white" to={`/rentals/${rentalId}/workspace`}>Continue to Rental Workspace</Link></div></section>}
    {selected ? <LineTermsEditor key={`${selected.id}:${getContractForRentalEquipmentLine(selected.id)?.updatedAt ?? "new"}`} rental={rental} line={selected} contract={getContractForRentalEquipmentLine(selected.id)} equipmentLabel={equipment.find((item) => item.id === selected.equipmentId)?.assetNo ?? selected.equipmentId} operatorLabel={operators.find((item) => item.id === selected.operatorId)?.name ?? selected.operatorId} saveTerms={(input) => { const result = saveCommercialTermsForRentalEquipmentLine(rentalId, selected.id, input); if (!result.success) { showToast(result.message ?? "Unable to save commercial terms.", "error"); return result; } const next=lines.find((line) => line.id !== selected.id && !getContractForRentalEquipmentLine(line.id) && !line.commercialSnapshot); if (next) { setSelectedId(next.id); showToast("Commercial terms saved. Configure the next incomplete equipment line.", "success"); } else showToast("Commercial terms saved. All equipment lines are configured.", "success"); return result; }} /> : <p className="rounded border border-amber-300 bg-amber-50 p-4">This Rental has no equipment lines and cannot be released.</p>}
  </div>;
}
