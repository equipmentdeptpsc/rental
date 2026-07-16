import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useToast } from "@/components/ui/toast/ToastContext";

import { useAudit } from "@/features/equipment/audit/AuditContext";

import {
  useEquipmentHistory,
} from "@/features/equipment/history";

import {
  restoredHistory,
  deletedHistory,
} from "@/features/equipment/application";

export default function EquipmentTrash() {
  const {
    getDeletedEquipment,
    restoreEquipment,
    permanentlyDeleteEquipment,
  } = useEquipment();

  const { showToast } =
    useToast();

  const { logAction } =
    useAudit();

  const { log } =
    useEquipmentHistory();

  const deletedEquipment =
    getDeletedEquipment();

  function restore(id: string) {
    const equipment =
      deletedEquipment.find(
        (x) => x.id === id
      );

    if (!equipment) return;

    const confirmed =
      window.confirm(
        "Restore this equipment?"
      );

    if (!confirmed) return;

    restoreEquipment(id);

    logAction({
      action: "UPDATE",
      equipmentId: id,
      after: equipment,
    });

    log(
      restoredHistory(id)
    );

    showToast(
      "Equipment restored successfully.",
      "success"
    );
  }

  function removeForever(
    id: string
  ) {
    const equipment =
      deletedEquipment.find(
        (x) => x.id === id
      );

    if (!equipment) return;

    const confirmed =
      window.confirm(
        "This will permanently delete the equipment.\n\nThis action cannot be undone.\n\nContinue?"
      );

    if (!confirmed) return;

    const result = permanentlyDeleteEquipment(id);

    if (!result.success) {
      showToast(result.message ?? "Equipment cannot be permanently deleted.", "error");
      return;
    }

    logAction({
      action: "DELETE",
      equipmentId: id,
      before: equipment,
    });

    log(
      deletedHistory(id)
    );

    showToast(
      "Equipment permanently deleted.",
      "success"
    );
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            Equipment Trash
          </h1>

          <p className="text-gray-500">
            Restore or permanently delete equipment.
          </p>
        </div>

        <Link to="/equipment">
          <Button variant="secondary">
            Back
          </Button>
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white">
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

              <th className="p-3 text-right">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {deletedEquipment.length ===
              0 && (
              <tr>
                <td
                  colSpan={4}
                  className="p-6 text-center text-gray-500"
                >
                  Trash is empty.
                </td>
              </tr>
            )}

            {deletedEquipment.map(
              (item) => (
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
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          restore(item.id)
                        }
                      >
                        Restore
                      </Button>

                      <Button
                        variant="danger"
                        onClick={() =>
                          removeForever(
                            item.id
                          )
                        }
                      >
                        Delete Forever
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
