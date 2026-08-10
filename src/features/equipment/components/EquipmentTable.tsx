import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";
import ResponsiveTable from "@/components/ui/ResponsiveTable";

import { useToast } from "@/components/ui/toast/ToastContext";

import { useAudit } from "@/features/equipment/audit/AuditContext";

import {
  useEquipmentHistory,
  createHistoryEvent,
} from "@/features/equipment/history";

import type { EquipmentRecord } from "../types";
import { presentEquipmentStatus } from "../utils/equipmentStatusPresentation";

interface Props {
  equipment: EquipmentRecord[];

  onDelete(id: string): void;
}

export default function EquipmentTable({
  equipment,
  onDelete,
}: Props) {
  const { showToast } =
    useToast();

  const { logAction } =
    useAudit();

  const { log } =
    useEquipmentHistory();

  function confirmDelete(
    equipment: EquipmentRecord
  ) {
    const confirmed =
      window.confirm(
        `Move "${equipment.equipmentName}" (${equipment.assetNo}) to Trash?`
      );

    if (!confirmed) return;

    onDelete(equipment.id);

    logAction({
      action: "DELETE",
      equipmentId: equipment.id,
      before: equipment,
    });

    log(
      createHistoryEvent(
        equipment.id,
        "Equipment Deleted",
        `${equipment.equipmentName} moved to Trash.`,
        "STATUS_CHANGE"
      )
    );

    showToast(
      "Equipment moved to Trash.",
      "success"
    );
  }

  return (
    <ResponsiveTable><div className="rounded-lg border bg-white min-w-max">

      <table className="min-w-full">

        <thead className="bg-gray-100">
          <tr>

            <th className="p-3 text-left">
              Asset No.
            </th>

            <th className="p-3 text-left">
              Equipment
            </th>

            <th className="p-3 text-left">
              Category
            </th>

            <th className="p-3 text-left">
              Status
            </th>

            <th className="p-3 text-right">
              Actions
            </th>

          </tr>
        </thead>

        <tbody>

          {equipment.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className="p-6 text-center text-gray-500"
              >
                No equipment found.
              </td>
            </tr>
          )}

          {equipment.map((item) => (
            <tr
              key={item.id}
              className="border-t"
            >

              <td className="p-3">
                {item.assetNo}
              </td>

              <td className="p-3">
                {item.equipmentName}
              </td>

              <td className="p-3">
                {item.category}
              </td>

              <td className="p-3">
                {presentEquipmentStatus(item.status)}
              </td>

              <td className="p-3">

                <div className="flex justify-end gap-2">

                  <Link
                    to={`/equipment/${item.id}`}
                  >
                    <Button variant="secondary">
                      View
                    </Button>
                  </Link>

                  <Link
                    to={`/equipment/edit/${item.id}`}
                  >
                    <Button variant="secondary">
                      Edit
                    </Button>
                  </Link>

                  <Button
                    variant="danger"
                    onClick={() =>
                      confirmDelete(item)
                    }
                  >
                    Delete
                  </Button>

                </div>

              </td>

            </tr>
          ))}

        </tbody>

      </table>

    </div></ResponsiveTable>
  );
}
