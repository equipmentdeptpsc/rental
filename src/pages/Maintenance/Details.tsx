import { useNavigate, useParams } from "react-router-dom";

import Button from "@/components/ui/Button";

import { useMaintenance } from "@/features/maintenance/context/MaintenanceContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useAudit } from "@/features/equipment/audit/AuditContext";

import type { MaintenanceRecord } from "@/features/maintenance/types";
import type { EquipmentRecord } from "@/features/equipment/types";

export default function MaintenanceDetails() {
  const { id } = useParams();

  const navigate = useNavigate();

  const {
    maintenance,
    updateMaintenance,
  } = useMaintenance();

  const {
    equipment,
    updateStatus,
  } = useEquipment();

  const { logAction } = useAudit();

  const workOrder = maintenance.find(
    (m) => m.id === id
  );

  if (!workOrder) {
    return (
      <div className="p-8">
        Work order not found.
      </div>
    );
  }

  const currentWorkOrder: MaintenanceRecord =
    workOrder;

  const machine = equipment.find(
    (e) =>
      e.id === currentWorkOrder.equipmentId
  );

  if (!machine) {
    return (
      <div className="p-8">
        Equipment not found.
      </div>
    );
  }

  const currentMachine: EquipmentRecord =
    machine;

  function startMaintenance() {
    updateMaintenance({
      ...currentWorkOrder,
      status: "In Progress",
    });

    updateStatus(
      currentMachine.id,
      "Maintenance"
    );

    logAction({
      action: "UPDATE",
      equipmentId: currentMachine.id,
      before: currentMachine,
      after: {
        ...currentMachine,
        status: "Maintenance",
      },
    });
  }

  function completeMaintenance() {
    updateMaintenance({
      ...currentWorkOrder,
      status: "Completed",
      completedDate:
        new Date()
          .toISOString()
          .split("T")[0],
    });

    updateStatus(
      currentMachine.id,
      "Available"
    );

    logAction({
      action: "UPDATE",
      equipmentId: currentMachine.id,
      before: currentMachine,
      after: {
        ...currentMachine,
        status: "Available",
      },
    });

    navigate("/maintenance");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="text-3xl font-bold">
        Work Order
      </h1>

      <div className="space-y-3 rounded-xl border bg-white p-6">
        <p>
          Equipment ID:{" "}
          {currentWorkOrder.equipmentId}
        </p>

        <p>
          Type:{" "}
          {currentWorkOrder.maintenanceType}
        </p>

        <p>
          Scheduled Reading:{" "}
          {currentWorkOrder.scheduledReading}
        </p>

        <p>
          Current Reading:{" "}
          {currentWorkOrder.currentReading}
        </p>

        <p>
          Technician:{" "}
          {currentWorkOrder.technician}
        </p>

        <p>
          Status:{" "}
          <strong>
            {currentWorkOrder.status}
          </strong>
        </p>
      </div>

      <div className="flex gap-3">
        {currentWorkOrder.status ===
          "Scheduled" && (
          <Button
            onClick={startMaintenance}
          >
            Start Maintenance
          </Button>
        )}

        {currentWorkOrder.status ===
          "In Progress" && (
          <Button
            onClick={completeMaintenance}
          >
            Complete Maintenance
          </Button>
        )}
      </div>
    </div>
  );
}