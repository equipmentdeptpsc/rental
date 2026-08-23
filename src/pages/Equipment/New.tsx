import { useNavigate } from "react-router-dom";

import EquipmentForm from "@/features/equipment/components/EquipmentForm";

import type {
  EquipmentFormData,
} from "@/features/equipment/types";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useAudit } from "@/features/equipment/audit/AuditContext";
import { validateDuplicateEquipment } from "@/features/equipment/utils/duplicateValidator";
import { buildManualEquipmentRecord } from "@/features/equipment/services/manualEquipmentRegistration";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { getEquipmentRuntimeCapability, REMOTE_EQUIPMENT_MUTATION_UNAVAILABLE_MESSAGE } from "@/features/equipment/services/equipmentRuntimeCapability";
import RemoteMutationUnavailable from "@/components/ui/RemoteMutationUnavailable";

export default function NewEquipment() {
  const { configuration } = useApplicationDependenciesCompatibility();
  return getEquipmentRuntimeCapability(configuration).legacyMutations ? <LocalNewEquipment /> : <RemoteMutationUnavailable title="New Equipment" message={REMOTE_EQUIPMENT_MUTATION_UNAVAILABLE_MESSAGE} />;
}

function LocalNewEquipment() {
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
      throw new Error(validation.message);
    }

    const created = addEquipment(newRecord);
    if (!created.success || !created.record) {
      throw new Error(created.message ?? "Equipment could not be created.");
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
