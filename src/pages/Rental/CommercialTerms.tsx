import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast/ToastContext";
import { useRental } from "@/features/rental/context/RentalContext";
import { canEditRentalCommercialTerms, type RentalCommercialTermsInput } from "@/features/rental/services/configureRentalCommercialTerms";

const optionalNumber = (value: string): number | undefined => value.trim() === "" ? undefined : Number(value);

export default function RentalCommercialTermsPage() {
  const { rentalId = "" } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { getRental, getContract, saveCommercialTerms } = useRental();
  const rental = getRental(rentalId);
  const contract = getContract(rentalId);
  const [currency, setCurrency] = useState(contract?.currency ?? "PHP");
  const [unitRate, setUnitRate] = useState(contract ? String(contract.unitRate) : "");
  const [minimumBillableHours, setMinimumBillableHours] = useState(contract?.minimumBillableHours?.toString() ?? "");
  const [overtimeRate, setOvertimeRate] = useState(contract?.overtimeRate?.toString() ?? "");
  const [standbyRate, setStandbyRate] = useState(contract?.standbyRate?.toString() ?? "");
  const [mobilizationFee, setMobilizationFee] = useState(contract?.mobilizationFee?.toString() ?? "");
  const [demobilizationFee, setDemobilizationFee] = useState(contract?.demobilizationFee?.toString() ?? "");
  const [fuelCharge, setFuelCharge] = useState(contract?.fuelCharge?.toString() ?? "");
  const [operatorIncluded, setOperatorIncluded] = useState(contract?.operatorIncluded ?? rental?.rentalType === "Operated Rental");
  const [operatorRate, setOperatorRate] = useState(contract?.operatorRate?.toString() ?? "");
  const [contractAmount, setContractAmount] = useState(contract?.contractAmount?.toString() ?? "");
  const [taxRate, setTaxRate] = useState(contract?.taxRate?.toString() ?? "");
  const [withholdingTax, setWithholdingTax] = useState(contract?.withholdingTax?.toString() ?? "");
  const [relationship, setRelationship] = useState<RentalCommercialTermsInput["transactionRelationship"]>(rental?.transactionRelationship ?? "Non-Affiliate");
  const [vatApplicability, setVatApplicability] = useState<RentalCommercialTermsInput["vatApplicability"]>(rental?.billingTerms?.vatApplicability ?? "Applicable");
  const [remarks, setRemarks] = useState(contract?.remarks ?? "");

  if (!rental) return <div className="p-8">Rental not found.</div>;
  const editable = canEditRentalCommercialTerms(rental);

  function save() {
    const result = saveCommercialTerms(rentalId, {
      currency, unitRate: Number(unitRate), minimumBillableHours: optionalNumber(minimumBillableHours),
      overtimeRate: optionalNumber(overtimeRate), standbyRate: optionalNumber(standbyRate),
      mobilizationFee: optionalNumber(mobilizationFee), demobilizationFee: optionalNumber(demobilizationFee),
      fuelCharge: optionalNumber(fuelCharge), operatorIncluded, operatorRate: optionalNumber(operatorRate),
      contractAmount: optionalNumber(contractAmount), taxRate: optionalNumber(taxRate),
      withholdingTax: optionalNumber(withholdingTax), transactionRelationship: relationship,
      vatApplicability, remarks,
    });
    if (!result.success) return showToast(result.message ?? "Unable to save commercial terms.", "error");
    showToast("Commercial terms saved. Rental is ready for release.", "success");
    navigate(`/rentals/${rentalId}/workspace`);
  }

  const numberField = (label: string, value: string, setValue: (value: string) => void, required = false) => <label className="text-sm">{label}<input className="mt-1 block w-full rounded border p-2" type="number" min="0" step="any" required={required} disabled={!editable} value={value} onChange={(event) => setValue(event.target.value)} /></label>;

  return <div className="mx-auto max-w-4xl space-y-6 p-6">
    <header><Link className="text-sm text-blue-700" to={`/rentals/${rentalId}/workspace`}>← Rental Workspace</Link><h1 className="mt-2 text-3xl font-bold">Commercial Terms</h1><p className="mt-2 text-slate-600">{rental.rentalNumber ?? rental.id} · {rental.billingMethod}</p></header>
    {!editable && <p className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-800">Commercial terms are read-only because this Rental has been released.</p>}
    <section className="rounded-xl border bg-white p-6 shadow-sm"><div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm">Currency<input className="mt-1 block w-full rounded border p-2" required disabled={!editable} value={currency} onChange={(event) => setCurrency(event.target.value)} /></label>
      {numberField("Unit Rate", unitRate, setUnitRate, true)}
      <label className="text-sm">Transaction Relationship<select className="mt-1 block w-full rounded border p-2" disabled={!editable} value={relationship} onChange={(event) => setRelationship(event.target.value as typeof relationship)}><option>Non-Affiliate</option><option>Affiliate</option></select></label>
      <label className="text-sm">VAT Applicability<select className="mt-1 block w-full rounded border p-2" disabled={!editable} value={vatApplicability} onChange={(event) => setVatApplicability(event.target.value as typeof vatApplicability)}><option>Applicable</option><option>Not Applicable</option></select></label>
      {numberField("Minimum Billable Hours", minimumBillableHours, setMinimumBillableHours)}{numberField("Overtime Rate", overtimeRate, setOvertimeRate)}
      {numberField("Standby Rate", standbyRate, setStandbyRate)}{numberField("Mobilization Fee", mobilizationFee, setMobilizationFee)}
      {numberField("Demobilization Fee", demobilizationFee, setDemobilizationFee)}{numberField("Fuel Charge", fuelCharge, setFuelCharge)}
      {numberField("Operator Rate", operatorRate, setOperatorRate)}{numberField("Contract Amount", contractAmount, setContractAmount)}
      {numberField("Tax Rate (%)", taxRate, setTaxRate)}{numberField("Withholding Tax (%)", withholdingTax, setWithholdingTax)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={operatorIncluded} onChange={(event) => setOperatorIncluded(event.target.checked)} /> Operator included</label>
      <label className="sm:col-span-2 text-sm">Remarks<textarea className="mt-1 block w-full rounded border p-2" disabled={!editable} value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label>
    </div>{editable && <div className="mt-6 flex justify-end"><Button type="button" onClick={save}>Save Commercial Terms</Button></div>}</section>
  </div>;
}
