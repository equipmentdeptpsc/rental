import type {
    ContractSummary,
  } from "../types";
  
  interface Props {
    contract: ContractSummary;
  }
  
  export default function ContractSummaryCard({
    contract,
  }: Props) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
  
        <div className="mb-6 flex items-center justify-between">
  
          <div>
  
            <h2 className="text-xl font-semibold">
              Contract Summary
            </h2>
  
            <p className="text-sm text-slate-500">
              Commercial information for this rental contract
            </p>
  
          </div>
  
          <span className="rounded-full bg-green-100 px-4 py-2 text-sm font-medium text-green-700">
  
            {contract.contractStatus}
  
          </span>
  
        </div>
  
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
  
          <Field
            label="Contract No."
            value={contract.contractNo}
          />
  
          <Field
            label="Customer"
            value={contract.customerName}
          />
  
          <Field
            label="Project"
            value={contract.projectName}
          />
  
          <Field
            label="Project Location"
            value={contract.projectLocation}
          />
  
          <Field
            label="Rental Type"
            value={contract.rentalType}
          />
  
          <Field
            label="Billing Method"
            value={contract.billingMethod}
          />
  
          <Field
            label="Contract Start"
            value={contract.contractStart}
          />
  
          <Field
            label="Contract End"
            value={contract.contractEnd}
          />
  
          <Field
            label="Total Contract Days"
            value={contract.totalDays.toString()}
          />
  
          <Field
            label="Days Remaining"
            value={contract.daysRemaining.toString()}
          />
  
        </div>
  
      </div>
    );
  }
  
  interface FieldProps {
    label: string;
  
    value: string;
  }
  
  function Field({
    label,
    value,
  }: FieldProps) {
    return (
      <div>
  
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
  
          {label}
  
        </div>
  
        <div className="font-semibold text-slate-800">
  
          {value}
  
        </div>
  
      </div>
    );
  }