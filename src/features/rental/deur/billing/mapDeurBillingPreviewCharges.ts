import type { BillingChargeResult } from "@/features/rental/billing/engine";

export interface DeurBillingPreviewChargeRow { key: keyof BillingChargeResult; label: string; amount: number; core: boolean }

export function mapDeurBillingPreviewCharges(charges: BillingChargeResult): DeurBillingPreviewChargeRow[] {
  const candidates: DeurBillingPreviewChargeRow[] = [
    { key: "operatingCharge", label: "Operating charge", amount: charges.operatingCharge, core: false },
    { key: "idleCharge", label: "Idle / standby", amount: charges.idleCharge, core: false },
    { key: "mobilizationCharge", label: "Mobilization", amount: charges.mobilizationCharge, core: false },
    { key: "demobilizationCharge", label: "Demobilization", amount: charges.demobilizationCharge, core: false },
    { key: "fuelCharge", label: "Fuel", amount: charges.fuelCharge, core: false },
    { key: "operatorCharge", label: "Operator", amount: charges.operatorCharge, core: false },
    { key: "subtotal", label: "Subtotal", amount: charges.subtotal, core: true },
    { key: "vat", label: "VAT", amount: charges.vat, core: false },
    { key: "withholdingTax", label: "Withholding tax", amount: charges.withholdingTax, core: false },
    { key: "grandTotal", label: "Grand total", amount: charges.grandTotal, core: true },
  ];
  return candidates.filter((row) => row.core || row.amount !== 0);
}
