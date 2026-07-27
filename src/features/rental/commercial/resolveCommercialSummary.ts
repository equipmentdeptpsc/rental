import type { RentalCommercialSnapshot } from "../types";

export interface CommercialSummaryRow {
  key: string;
  label: string;
  value: number;
  kind: "money" | "hours";
}

export function resolveCommercialSummary(snapshot?: RentalCommercialSnapshot): CommercialSummaryRow[] {
  if (!snapshot) return [];
  const rows: CommercialSummaryRow[] = [];
  const money = (key: keyof RentalCommercialSnapshot, label: string) => {
    const value = snapshot[key];
    if (typeof value === "number") rows.push({ key, label, value, kind: "money" });
  };
  if (snapshot.billingMethod === "Per Hour") {
    money("unitRate", "Operating Rate");
    money("standbyRate", "Standby Rate");
    money("overtimeRate", "Overtime Rate");
    if (typeof snapshot.minimumBillableHours === "number") rows.push({ key: "minimumBillableHours", label: "Minimum Billable Hours", value: snapshot.minimumBillableHours, kind: "hours" });
  } else if (snapshot.billingMethod === "One Lot") money("contractAmount", "Contract Amount");
  else money("unitRate", "Unit Rate");
  if (!snapshot.operatorIncluded) money("operatorRate", "Operator Rate");
  money("fuelCharge", "Fuel Charge");
  money("mobilizationFee", "Mobilization Fee");
  money("demobilizationFee", "Demobilization Fee");
  return rows;
}
