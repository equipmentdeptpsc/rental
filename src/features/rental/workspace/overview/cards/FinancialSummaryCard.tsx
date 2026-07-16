import type {
    FinancialSummary,
  } from "../types";
  
  interface Props {
    financial: FinancialSummary;
  }
  
  export default function FinancialSummaryCard({
    financial,
  }: Props) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
  
        <div className="mb-5">
          <h2 className="text-xl font-semibold">
            Financial Summary
          </h2>
  
          <p className="text-sm text-slate-500">
            Current financial status of this rental.
          </p>
        </div>
  
        <div className="grid gap-5 md:grid-cols-3">
  
          <Money
            label="Operating Charges"
            value={financial.operatingCharges}
          />
  
          <Money
            label="Idle Charges"
            value={financial.idleCharges}
          />
  
          <Money
            label="Mobilization"
            value={financial.mobilizationCharges}
          />
  
          <Money
            label="Demobilization"
            value={financial.demobilizationCharges}
          />
  
          <Money
            label="Adjustments"
            value={financial.adjustments}
          />
  
          <Money
            label="Subtotal"
            value={financial.subtotal}
          />
  
        </div>
  
      </div>
    );
  }
  
  function Money({
    label,
    value,
  }: {
    label: string;
    value: number;
  }) {
    return (
      <div>
  
        <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">
          {label}
        </div>
  
        <div className="font-semibold">
          ₱ {value.toLocaleString()}
        </div>
  
      </div>
    );
  }
