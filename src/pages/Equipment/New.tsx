import { useNavigate } from "react-router-dom";

import EquipmentForm from "@/features/equipment/components/EquipmentForm";

import type {
  EquipmentFormData,
  EquipmentRecord,
} from "@/features/equipment/types";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useAudit } from "@/features/equipment/audit/AuditContext";
import { validateDuplicateEquipment } from "@/features/equipment/utils/duplicateValidator";
import { generateAssetNumber } from "@/features/equipment/utils/generateAssetNumber";

export default function NewEquipment() {
  const navigate = useNavigate();

  const {
    equipment,
    addEquipment,
  } = useEquipment();

  const { logAction } = useAudit();

  const formDefaults: EquipmentFormData = {
    prefixId: "",

    assetNo: generateAssetNumber(equipment),

    equipmentName: "",

    typeId: "",
    type: "",

    manufacturer: "",
    model: "",
    serialNumber: "",
    engineNumber: "",
    chassisNumber: "",
    plateNumber: "",
    yearModel: "",
    capacity: "",

    category: "",

    maintenanceType: "Engine Hours",

    currentReading: "",

    projectId: "",

    operatorId: "",
  };

  function handleSubmit(
    data: EquipmentFormData
  ) {
    const newRecord: EquipmentRecord = {
      id: crypto.randomUUID(),

      prefixId: data.prefixId,

      assetNo: data.assetNo || generateAssetNumber(equipment),

      equipmentName: data.equipmentName,

      typeId: data.typeId,
      type: data.type,

      manufacturer: data.manufacturer,
      model: data.model,
      serialNumber: data.serialNumber,
      engineNumber: data.engineNumber,
      chassisNumber: data.chassisNumber,
      plateNumber: data.plateNumber,

      yearModel:
        data.yearModel === ""
          ? undefined
          : Number(data.yearModel),

      capacity: data.capacity,

      category:
        data.category as EquipmentRecord["category"],

      maintenanceType:
        data.maintenanceType,

      currentReading: Number(
        data.currentReading
      ),

      projectId: "",

      operatorId: "",

      status: "Available",

      deleted: false,
    };

    const validation =
      validateDuplicateEquipment(
        equipment,
        newRecord
      );

    if (!validation.valid) {
      alert(validation.message);
      return;
    }

    addEquipment(newRecord);

    logAction({
      action: "CREATE",
      equipmentId: newRecord.id,
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
        initialData={formDefaults}
        submitLabel="Create Equipment"
        onSubmit={handleSubmit}
        onCancel={() =>
          navigate("/equipment")
        }
      />
    </div>
  );
}
