import {
    useRentalWorkspaceAggregate,
  } from "..";
  
  export default function AssignmentSummaryCard() {
    const aggregate =
      useRentalWorkspaceAggregate();
  
    const assignment =
      aggregate.assignment;
  
    return (
      <div className="rounded-lg border bg-white p-6">
  
        <h3 className="mb-5 text-lg font-semibold">
          Assignment Summary
        </h3>
  
        <div className="grid gap-5 md:grid-cols-2">
  
          <Info
            label="Equipment"
            value={
              aggregate.equipment
                ?.equipmentName ?? "-"
            }
          />
  
          <Info
            label="Operator"
            value={
              aggregate.operator?.name ??
              "-"
            }
          />
  
          <Info
            label="Project"
            value={
              aggregate.project?.projectName ??
              aggregate.rental.project
            }
          />
  
          <Info
            label="Assigned Date"
            value={
              assignment?.assignedDate ??
              "-"
            }
          />
  
          <Info
            label="Expected Return"
            value={
              assignment?.expectedReturn ??
              aggregate.rental
                .expectedReturn
            }
          />
  
          <Info
            label="Status"
            value={
              assignment?.status ??
              "Not Assigned"
            }
          />
  
        </div>
  
      </div>
    );
  }
  
  interface InfoProps {
    label: string;
  
    value: string;
  }
  
  function Info({
    label,
    value,
  }: InfoProps) {
    return (
      <div>
  
        <div className="text-xs uppercase tracking-wide text-slate-500">
          {label}
        </div>
  
        <div className="mt-1 font-medium">
          {value}
        </div>
  
      </div>
    );
  }