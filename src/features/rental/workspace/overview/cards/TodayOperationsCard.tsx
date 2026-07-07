import type {
    TodayOperationsSummary,
  } from "../types";
  
  interface Props {
    today: TodayOperationsSummary;
  }
  
  export default function TodayOperationsCard({
    today,
  }: Props) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
  
        <div className="mb-5">
  
          <h2 className="text-xl font-semibold">
            Today's Operations
          </h2>
  
          <p className="text-sm text-slate-500">
            Live operational status from the Digital DEUR.
          </p>
  
        </div>
  
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
  
          <Field
            label="Current Status"
            value={today.currentStatus}
          />
  
          <Field
            label="Current Activity"
            value={today.currentActivity}
          />
  
          <Field
            label="Operator"
            value={today.operator}
          />
  
          <Field
            label="Activity Started"
            value={today.activityStarted}
          />
  
          <Field
            label="Operating"
            value={`${today.operatingMinutes} min`}
          />
  
          <Field
            label="Idle"
            value={`${today.idleMinutes} min`}
          />
  
          <Field
            label="Meal Break"
            value={`${today.mealBreakMinutes} min`}
          />
  
          <Field
            label="Corrective Maintenance"
            value={`${today.correctiveMaintenanceMinutes} min`}
          />
  
          <Field
            label="Preventive Maintenance"
            value={`${today.preventiveMaintenanceMinutes} min`}
          />
  
          <Field
            label="End of Shift"
            value={
              today.endOfShiftSubmitted
                ? "Submitted"
                : "Not Yet Submitted"
            }
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
  
        <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">
          {label}
        </div>
  
        <div className="font-semibold">
          {value}
        </div>
  
      </div>
    );
  }