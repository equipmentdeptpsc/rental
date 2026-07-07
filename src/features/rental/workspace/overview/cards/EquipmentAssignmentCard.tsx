import type {
    EquipmentAssignmentSummary,
  } from "../types";
  
  interface Props {
    equipment: EquipmentAssignmentSummary;
  }
  
  export default function EquipmentAssignmentCard({
    equipment,
  }: Props) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
  
        <div className="mb-5">
  
          <h2 className="text-xl font-semibold">
            Equipment Assignment
          </h2>
  
          <p className="text-sm text-slate-500">
            Equipment currently assigned to this rental contract.
          </p>
  
        </div>
  
        <div className="grid gap-5 md:grid-cols-2">
  
          <Field
            label="Asset Number"
            value={equipment.assetNo}
          />
  
          <Field
            label="Equipment"
            value={equipment.equipmentName}
          />
  
          <Field
            label="Equipment ID"
            value={equipment.equipmentId}
          />
  
          <Field
            label="Status"
            value={equipment.equipmentStatus}
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