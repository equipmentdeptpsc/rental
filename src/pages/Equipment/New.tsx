import { useNavigate } from "react-router-dom";

import EquipmentForm from "@/features/equipment/components/EquipmentForm";

import type {
  EquipmentFormData,
  EquipmentRecord,
} from "@/features/equipment/types";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useAudit } from "@/features/equipment/audit/AuditContext";

import { useToast } from "@/components/ui/toast/ToastContext";

import {
  createHistoryEvent,
  useEquipmentHistory,
} from "@/features/equipment/history";

import { usePrefix } from "@/features/settings";

export default function NewEquipment() {
  const navigate = useNavigate();

  const {
    equipment,
    addEquipment,
  } = useEquipment();

  const { showToast } =
    useToast();

  const { logAction } =
    useAudit();

  const { log } =
    useEquipmentHistory();

  const {
    generateAssetNumber,
  } = usePrefix();

  const formDefaults: EquipmentFormData = {
    prefixId: "",
    assetNo: "",
    equipmentName: "",
    category: "",
    maintenanceType: "Engine Hours",
    currentReading: "",
    projectId: "",
    operatorId: "",
  };

  function handleSubmit(
    data: EquipmentFormData
  ) {
    if (!data.category) {
      showToast(
        "Equipment Category is required.",
        "error"
      );
      return;
    }

    const generated =
      generateAssetNumber(
        data.category
      );

    if (!generated) {
      showToast(
        "No prefix configured for this category.",
        "error"
      );
      return;
    }

    const duplicate =
      equipment.some(
        (e) =>
          e.assetNo ===
          generated.assetNo
      );

    if (duplicate) {
      showToast(
        "Generated Asset Number already exists.",
        "error"
      );
      return;
    }

    const newRecord: EquipmentRecord = {
      id: crypto.randomUUID(),
    
      prefixId: generated.prefixId,
    
      assetNo: generated.assetNo,
    
      equipmentName: data.equipmentName.trim(),
    
      category: data.category,
    
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

    log(
      createHistoryEvent(
        newRecord.id,
        "Equipment Created",
        `${newRecord.equipmentName} was added to the fleet.`,
        "CREATED"
      )
    );

    showToast(
      "Equipment created successfully.",
      "success"
    );

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