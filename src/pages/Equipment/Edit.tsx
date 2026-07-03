import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import EquipmentForm from "@/features/equipment/components/EquipmentForm";
import type { EquipmentFormData } from "@/features/equipment/components/EquipmentForm";

import type { EquipmentRecord } from "@/features/equipment/data/equipment.mock";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useAudit } from "@/features/equipment/audit/AuditContext";

import { EquipmentLifecycle } from "@/features/equipment/rules/equipmentLifecycle";

export default function EditEquipment() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { equipment, updateEquipment } = useEquipment();
  const { logAction } = useAudit();

  const selected = useMemo(() => {
    return equipment.find((e) => e.id === id) ?? null;
  }, [equipment, id]);

  if (!selected) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-bold">
          Equipment not found
        </h1>

        <button
          className="mt-4 text-blue-600 underline"
          onClick={() => navigate("/equipment")}
        >
          Back
        </button>
      </div>
    );
  }

  const safeSelected = selected;

  const isLocked = !EquipmentLifecycle.canEdit(safeSelected);

  const initialData: EquipmentFormData = {
    assetNo: safeSelected.assetNo,
    equipmentName: safeSelected.equipmentName,
    category: safeSelected.category,
    maintenanceType: safeSelected.maintenanceType,
    currentReading: String(safeSelected.currentReading),
    project: safeSelected.project,
    operator: safeSelected.operator,
  };

  function handleSubmit(data: EquipmentFormData) {
    if (isLocked) {
      alert("This equipment is locked due to maintenance status.");
      return;
    }

    const updated: EquipmentRecord = {
      id: safeSelected.id,
      assetNo: data.assetNo,
      equipmentName: data.equipmentName,
      category: data.category,
      maintenanceType: data.maintenanceType,
      currentReading: Number(data.currentReading),
      project: data.project,
      operator: data.operator,
      status: safeSelected.status,
    };

    updateEquipment(updated);

    logAction({
      action: "UPDATE",
      equipmentId: safeSelected.id,
      before: safeSelected,
      after: updated,
    });

    navigate("/equipment");
  }

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">
          Edit Equipment
        </h1>

        <p className="text-slate-500">
          {isLocked
            ? "This equipment is locked (Maintenance mode)"
            : "Update equipment information"}
        </p>
      </div>

      <EquipmentForm
        initialData={initialData}
        submitLabel={
          isLocked ? "Locked" : "Update Equipment"
        }
        onSubmit={handleSubmit}
        onCancel={() => navigate("/equipment")}
      />
    </div>
  );
}