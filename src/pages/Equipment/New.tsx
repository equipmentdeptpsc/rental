import { useNavigate } from "react-router-dom";

import EquipmentForm from "@/features/equipment/components/EquipmentForm";

import type {
  EquipmentFormData,
  EquipmentRecord,
} from "@/features/equipment/types";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";

import { useAudit } from "@/features/equipment/audit/AuditContext";

import {
  useEquipmentHistory,
  createHistoryEvent,
} from "@/features/equipment/history";

export default function NewEquipment() {
  const navigate = useNavigate();

  const { addEquipment } =
    useEquipment();

  const { logAction } =
    useAudit();

  const { log } =
    useEquipmentHistory();

  function handleSubmit(
    data: EquipmentFormData
  ) {
    const newRecord: EquipmentRecord =
      {
        id: crypto.randomUUID(),

        assetNo: data.assetNo,

        equipmentName:
          data.equipmentName,

        category:
          data.category,

        maintenanceType:
          data.maintenanceType,

        currentReading:
          Number(
            data.currentReading
          ),

        projectId:
          data.projectId,

        operatorId:
          data.operatorId,

        status:
          "Available",
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

    navigate("/equipment");
  }

  return (
    <div className="p-8 space-y-6">

      <h1 className="text-3xl font-bold">
        Add Equipment
      </h1>

      <EquipmentForm
        submitLabel="Create Equipment"
        onSubmit={
          handleSubmit
        }
        onCancel={() =>
          navigate("/equipment")
        }
      />
    </div>
  );
}