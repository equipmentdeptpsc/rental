import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { RentalCommercialSnapshot, RentalRecord } from "@/features/rental/types";
import type { RentalContractRecord } from "@/features/rental/types/RentalContract";
import { resolveCommercialSummary } from "@/features/rental/commercial/resolveCommercialSummary";

interface Props {
  rental: RentalRecord;
  lines: RentalEquipmentLine[];
  contracts: RentalContractRecord[];
  equipmentLabels: Record<string, string>;
}

const units: Record<string, string> = {
  "Per Hour": "hour", "Per Day": "day", "Per Week": "week", "Per Month": "month",
  "Per Kilometer": "km", "Per Trip": "trip", "Per Cubic Meter": "m³", "One Lot": "lot",
};

function termsForLine(line: RentalEquipmentLine, rental: RentalRecord, lines: RentalEquipmentLine[], contracts: RentalContractRecord[]): RentalContractRecord | RentalCommercialSnapshot | undefined {
  return contracts.find((contract) => contract.rentalEquipmentLineId === line.id)
    ?? (lines.length === 1 ? contracts.find((contract) => !contract.rentalEquipmentLineId && (contract.rentalId === rental.id || contract.id === rental.id)) : undefined)
    ?? line.commercialSnapshot
    ?? (lines.length === 1 ? rental.commercialSnapshot : undefined);
}

export default function CommercialTermsForApprovalCard({ rental, lines, contracts, equipmentLabels }: Props) {
  return <section className="rounded-xl border bg-white p-5 shadow-sm" aria-label="Commercial Terms for Approval">
    <h2 className="text-lg font-semibold">Commercial Terms for Approval</h2>
    <p className="mt-1 text-sm text-slate-600">Configured rates and billing terms for review. Actual accrued charges appear separately in Financial Summary.</p>
    {lines.length === 0 && <p className="mt-4 text-sm text-amber-800">No equipment lines are available.</p>}
    <div className="mt-4 space-y-4">{lines.map((line) => {
      const terms = termsForLine(line, rental, lines, contracts);
      const currency = terms?.currency ?? "PHP";
      const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(value);
      const unit = units[terms?.billingMethod ?? ""] ?? "unit";
      const rows: Array<[string, string | undefined]> = terms ? [
        ["Rental Type", rental.rentalType],
        ["Billing Method", terms.billingMethod],
        ["Rate Unit", unit],
        ["Base Rental Rate", `${money(terms.unitRate)} / ${unit}`],
        ...resolveCommercialSummary(terms).filter((row) => row.key !== "unitRate").map((row): [string, string] => [
          row.label,
          row.kind === "hours" ? `${row.value} hours` : `${money(row.value)}${["unitRate", "standbyRate", "overtimeRate"].includes(row.key) ? ` / ${unit}` : ""}`,
        ]),
        ["Idle Rate", terms.idleRate === undefined ? undefined : `${money(terms.idleRate)} / hour`],
        ["Standby Treatment", terms.standbyRate === undefined ? undefined : "Charged at the configured standby rate"],
        ["Discount Type", terms.discountType === undefined ? undefined : terms.discountType === "NONE" ? "None" : terms.discountType === "PERCENTAGE" ? "Percentage" : "Fixed amount per billing period"],
        ["Discount Value", terms.discountType && terms.discountType !== "NONE" && terms.discountValue !== undefined ? terms.discountType === "PERCENTAGE" ? `${terms.discountValue}%` : money(terms.discountValue) : undefined],
        ["VAT", terms.vatApplicability ?? (terms.taxRate !== undefined ? "Applicable" : undefined)],
        ["VAT Rate", terms.taxRate === undefined ? undefined : `${terms.taxRate}%`],
        ["Withholding Tax", terms.withholdingTax === undefined ? undefined : `${terms.withholdingTax}%`],
        ["Transaction Relationship", "transactionRelationship" in terms ? terms.transactionRelationship : undefined],
        ["Operator Included", terms.operatorIncluded ? "Yes" : "No"],
        ["Commercial Remarks", "remarks" in terms ? terms.remarks : undefined],
      ] : [];
      return <article key={line.id} className="rounded-lg border p-4">
        <h3 className="font-medium">{equipmentLabels[line.equipmentId] ?? "Equipment line"}</h3>
        {terms ? <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">{rows.filter(([, value]) => value !== undefined).map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>
          : <p className="mt-2 text-sm text-amber-800">Commercial terms are not configured for this equipment line.</p>}
      </article>;
    })}</div>
  </section>;
}
