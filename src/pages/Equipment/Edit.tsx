import { useNavigate } from "react-router-dom";

import EquipmentForm from "@/features/equipment/components/EquipmentForm";

import type {
  EquipmentFormData,
  EquipmentRecord,
} from "@/features/equipment/types";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useAudit } from "@/features/equipment/audit/AuditContext";

export default function EditEquipment() {
  const navigate = useNavigate();

  const { addEquipment } =
    useEquipment();

  const { logAction } =
    useAudit();

  function handleSubmit(
    data: EquipmentFormData
  ) {
    const newRecord: EquipmentRecord = {
      id: crypto.randomUUID(),
    
      prefixId: data.prefixId,
    
      assetNo: data.assetNo,
    
      equipmentName: data.equipmentName,
    
      category: data.category as EquipmentRecord["category"],
    
      maintenanceType: data.maintenanceType,
    
      currentReading: Number(data.currentReading),
    
      projectId: data.projectId,
    
      operatorId: data.operatorId,
    
      status: "Available",
    
      deleted: false,
    };

    addEquipment(newRecord);

    logAction({
      action: "CREATE",
      equipmentId:
        newRecord.id,
      after: newRecord,
    });

    navigate("/equipment");
  }

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">
        Add Equipment
      </h1>

      <EquipmentForm
        submitLabel="Create Equipment"
        onSubmit={handleSubmit}
        onCancel={() =>
          navigate("/equipment")
        }
      />
    </div>
  );
}