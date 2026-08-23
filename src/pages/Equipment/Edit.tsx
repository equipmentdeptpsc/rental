import { useNavigate, useParams } from "react-router-dom";

import EquipmentForm from "@/features/equipment/components/EquipmentForm";

import type {
  EquipmentFormData,
  EquipmentRecord,
} from "@/features/equipment/types";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { getEquipmentRuntimeCapability, REMOTE_EQUIPMENT_MUTATION_UNAVAILABLE_MESSAGE } from "@/features/equipment/services/equipmentRuntimeCapability";
import RemoteMutationUnavailable from "@/components/ui/RemoteMutationUnavailable";
import { useAudit } from "@/features/equipment/audit/AuditContext";
import { validateDuplicateEquipment } from "@/features/equipment/utils/duplicateValidator";

export default function EditEquipment() {
  const { configuration } = useApplicationDependenciesCompatibility();
  return getEquipmentRuntimeCapability(configuration).legacyMutations ? <LocalEditEquipment /> : <RemoteMutationUnavailable title="Edit Equipment" message={REMOTE_EQUIPMENT_MUTATION_UNAVAILABLE_MESSAGE} />;
}

function LocalEditEquipment() {
  const navigate = useNavigate();

  const { id } = useParams();

  const {
    equipment,
    updateEquipment,
  } = useEquipment();

  const { logAction } = useAudit();

  const existing =
  equipment.find(
    item => item.id === id
  );

if (!existing) {
  return (
    <div className="p-8">
      Equipment not found.
    </div>
  );
}

const current: EquipmentRecord = existing;

  const formData: EquipmentFormData = {
    prefixId: current.prefixId,

    assetNo: current.assetNo,

    equipmentName: current.equipmentName,

    typeId: current.typeId ?? "",
    type: current.type ?? "",
    brandId: current.brandId ?? "",
    brand: current.brand ?? "",

    costCodeId: current.costCodeId ?? "",

    manufacturer:
      current.manufacturer ?? "",

    model:
      current.model ?? "",

    serialNumber:
      current.serialNumber ?? "",

    engineNumber:
      current.engineNumber ?? "",

    chassisNumber:
      current.chassisNumber ?? "",

    plateNumber:
      current.plateNumber ?? "",

    yearModel:
      current.yearModel?.toString() ??
      "",

    capacity:
      current.capacity ?? "",

    category: current.category,
    categoryId: current.categoryId,
    subcategoryId: current.subcategoryId,
    subcategoryName: current.subcategoryName,
    status: current.status,
    statusId: current.statusId,
    ownershipId: current.ownershipId,
    ownership: current.ownership,
    conditionId: current.conditionId,
    condition: current.condition,
    locationId: current.locationId,
    location: current.location,
    remarks: current.remarks,

    maintenanceType:
      current.maintenanceType,

    currentReading:
      current.currentReading.toString(),

    projectId:
      current.projectId,

    operatorId:
      current.operatorId,
  };

  function handleSubmit(
    data: EquipmentFormData
  ) {

    const updated: EquipmentRecord = {
      ...current,
    
      id: current.id,
    
      status: current.status,

      prefixId: data.prefixId,

      assetNo: data.assetNo,

      equipmentName:
        data.equipmentName,

      typeId: data.typeId,

      type: data.type,
      brandId: data.brandId,
      brand: data.brand,

      costCodeId: data.costCodeId || undefined,

      manufacturer:
        data.manufacturer,

      model: data.model,

      serialNumber:
        data.serialNumber,

      engineNumber:
        data.engineNumber,

      chassisNumber:
        data.chassisNumber,

      plateNumber:
        data.plateNumber,

      yearModel:
        data.yearModel === ""
          ? undefined
          : Number(data.yearModel),

      capacity:
        data.capacity,

      category:
        data.category as EquipmentRecord["category"],
      categoryId: data.categoryId,
      subcategoryId: data.subcategoryId,
      subcategoryName: data.subcategoryName,
      ownershipId: data.ownershipId,
      ownership: data.ownership,
      conditionId: data.conditionId,
      condition: data.condition,
      locationId: data.locationId,
      location: data.location,
      remarks: data.remarks,

      maintenanceType:
        data.maintenanceType,

      currentReading:
        Number(data.currentReading),

      projectId:
        data.projectId,

      operatorId:
        data.operatorId,
    };

    const validation =
      validateDuplicateEquipment(
        equipment,
        updated
      );

    if (!validation.valid) {
      throw new Error(validation.message);
    }

    updateEquipment(updated);

    logAction({
      action: "UPDATE",
      equipmentId: updated.id,
      before: current,
      after: updated,
    });

    navigate("/equipment");
  }

  return (
    <div className="p-8 space-y-6">

      <h1 className="text-3xl font-bold">
        Edit Equipment
      </h1>

      <EquipmentForm
        initialData={formData}
        mode="edit"
        submitLabel="Save Changes"
        onSubmit={handleSubmit}
        onCancel={() =>
          navigate("/equipment")
        }
      />

    </div>
  );
}
