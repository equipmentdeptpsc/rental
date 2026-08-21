import { useNavigate } from "react-router-dom";

import EquipmentForm from "@/features/equipment/components/EquipmentForm";

import type {
  EquipmentFormData,
} from "@/features/equipment/types";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useAudit } from "@/features/equipment/audit/AuditContext";
import { validateDuplicateEquipment } from "@/features/equipment/utils/duplicateValidator";
import { buildManualEquipmentRecord } from "@/features/equipment/services/manualEquipmentRegistration";

export default function NewEquipment() {
  const navigate = useNavigate();

  const {
    equipment,
    addEquipment,
  } = useEquipment();

  const { logAction } = useAudit();

  const formDefaults: EquipmentFormData = {
    prefixId: "",

    assetNo: "",

    equipmentName: "",

    typeId: "",
    type: "",

    costCodeId: "",

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
    const newRecord = buildManualEquipmentRecord(data);

    const validation =
      validateDuplicateEquipment(
        equipment,
        newRecord
      );

    if (!validation.valid) {
      alert(validation.message);
      return;
    }

    const created = addEquipment(newRecord);
    if (!created.success || !created.record) {
      alert(created.message ?? "Equipment could not be created.");
      return;
    }

    logAction({
      action: "CREATE",
      equipmentId: created.record.id,
      after: created.record,
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
        mode="create"
        submitLabel="Create Equipment"
        onSubmit={handleSubmit}
        onCancel={() =>
          navigate("/equipment")
        }
      />
    </div>
  );
}
