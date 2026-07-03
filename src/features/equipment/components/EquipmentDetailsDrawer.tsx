import type { EquipmentRecord } from "../types";

import { useEquipment } from "../context/EquipmentContext";
import { useRental } from "@/features/rental/context/RentalContext";
import { useAudit } from "../audit/AuditContext";

import {
  EquipmentLifecycle,
  type EquipmentStatus,
} from "../rules/equipmentLifecycle";

import EquipmentAuditLog from "../audit/components/EquipmentAuditLog";

interface Props {
  open: boolean;
  equipment: EquipmentRecord | null;
  onClose: () => void;
}

export default function EquipmentDetailsDrawer({
  open,
  equipment,
  onClose,
}: Props) {
  const { updateEquipment } = useEquipment();

  const { rentals } = useRental();

  const { logAction } = useAudit();

  if (!open || equipment === null) {
    return null;
  }

  const currentEquipment = equipment;

  const activeRental = rentals.find(
    (r) =>
      r.equipmentId === currentEquipment.id &&
      r.status === "Active"
  );

  function handleStatusChange(
    next: EquipmentStatus
  ) {
    const result =
      EquipmentLifecycle.changeStatus(
        currentEquipment,
        next
      );

    if (!result.allowed) {
      alert(result.reason);
      return;
    }

    const updated: EquipmentRecord = {
      ...currentEquipment,
      status: next,
    };

    updateEquipment(updated);

    logAction({
      action: "UPDATE",
      equipmentId: currentEquipment.id,
      before: currentEquipment,
      after: updated,
    });
  }

  return (
    <div className="fixed right-0 top-0 h-full w-[430px] overflow-y-auto border-l bg-white p-6 shadow-xl">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold">
          Equipment Details
        </h2>

        <button onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="space-y-2">
        <p>
          <strong>Name:</strong>{" "}
          {currentEquipment.equipmentName}
        </p>

        <p>
          <strong>Asset:</strong>{" "}
          {currentEquipment.assetNo}
        </p>

        <p>
          <strong>Status:</strong>{" "}
          {currentEquipment.status}
        </p>
      </div>

      {activeRental && (
        <div className="mt-6 rounded border p-4">
          <h3 className="mb-3 font-semibold">
            Current Rental
          </h3>

          <p>
            Customer: {activeRental.customer}
          </p>

          <p>
            Project: {activeRental.project}
          </p>

          <p>
            Expected Return:{" "}
            {activeRental.expectedReturn}
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={() =>
            handleStatusChange("Available")
          }
          className="rounded bg-green-100 px-3 py-2"
        >
          Available
        </button>

        <button
          onClick={() =>
            handleStatusChange("Assigned")
          }
          className="rounded bg-blue-100 px-3 py-2"
        >
          Assigned
        </button>

        <button
          onClick={() =>
            handleStatusChange(
              "Maintenance"
            )
          }
          className="rounded bg-yellow-100 px-3 py-2"
        >
          Maintenance
        </button>
      </div>

      <div className="mt-8">
        <EquipmentAuditLog
          equipmentId={currentEquipment.id}
        />
      </div>
    </div>
  );
}