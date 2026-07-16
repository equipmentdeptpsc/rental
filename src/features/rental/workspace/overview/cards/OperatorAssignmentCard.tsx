import type {
    OperatorAssignmentSummary,
  } from "../types";
  
  interface Props {
    operator: OperatorAssignmentSummary;
  }
  
  export default function OperatorAssignmentCard({
    operator,
  }: Props) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
  
        <div className="mb-5">
  
          <h2 className="text-xl font-semibold">
            Operator Assignment
          </h2>
  
          <p className="text-sm text-slate-500">
            Operator currently assigned to this rental contract.
          </p>
  
        </div>
  
        <div className="grid gap-5 md:grid-cols-2">
  
          <Field
            label="Operator Name"
            value={operator.operatorName}
          />
  
          <Field
            label="Current Status"
            value={operator.operatorStatus}
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
