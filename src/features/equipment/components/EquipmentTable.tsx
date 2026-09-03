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
import type { EquipmentStatusFilter } from "../services/equipmentListFilters";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";

export interface EquipmentDeploymentSummary { project?: string; operator?: string; rentalNumber?: string; assignedDate?: string; dateDeployed?: string; hasAssignment: boolean }

interface Props {
  equipment: EquipmentRecord[];

  onDelete(id: string): void;
  detailMode?: EquipmentStatusFilter;
  deploymentByEquipment?: Record<string, EquipmentDeploymentSummary>;
}

export default function EquipmentTable({
  equipment,
  onDelete,
  detailMode = "All",
  deploymentByEquipment = {},
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
    <ResponsiveTable><div className="app-card min-w-max overflow-hidden">

      <table className="app-table min-w-full">

        <thead>
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

            {(detailMode === "Assigned" || detailMode === "Deployed") && <><th className="p-3 text-left">Project</th><th className="p-3 text-left">Operator</th><th className="p-3 text-left">{detailMode === "Assigned" ? "Assignment" : "Rental / Assignment"}</th><th className="p-3 text-left">{detailMode === "Assigned" ? "Assigned Date" : "Date Deployed"}</th></>}

            <th className="p-3 text-right">
              Actions
            </th>

          </tr>
        </thead>

        <tbody>

          {equipment.length === 0 && <tr><td colSpan={detailMode === "Assigned" || detailMode === "Deployed" ? 9 : 5}><EmptyState title="No equipment found" description="Try clearing a filter or adjusting your search." /></td></tr>}

          {equipment.map((item) => (
            <tr
              key={item.id}
              className=""
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
                <StatusBadge tone={item.status === "Available" ? "success" : item.status === "Maintenance" ? "warning" : "neutral"}>{presentEquipmentStatus(item.status)}</StatusBadge>
              </td>

              {(detailMode === "Assigned" || detailMode === "Deployed") && <><td className="p-3">{deploymentByEquipment[item.id]?.project ?? "Not linked"}</td><td className="p-3">{deploymentByEquipment[item.id]?.operator ?? "Not linked"}</td><td className="p-3">{deploymentByEquipment[item.id]?.rentalNumber ?? (deploymentByEquipment[item.id]?.hasAssignment ? "Active assignment" : "Not linked")}</td><td className="p-3">{detailMode === "Assigned" ? deploymentByEquipment[item.id]?.assignedDate ?? "—" : deploymentByEquipment[item.id]?.dateDeployed ?? "—"}</td></>}

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
