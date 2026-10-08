import { Link } from "react-router-dom";
import { ChevronRight, PackageOpen } from "lucide-react";
import type { ReactNode } from "react";

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
import InteractiveTableRow from "@/components/ui/InteractiveTableRow";

export interface EquipmentDeploymentSummary { project?: string; operator?: string; rentalNumber?: string; assignedDate?: string; dateDeployed?: string; hasAssignment: boolean }

interface Props {
  equipment: EquipmentRecord[];

  onDelete(id: string): void;
  detailMode?: EquipmentStatusFilter;
  deploymentByEquipment?: Record<string, EquipmentDeploymentSummary>;
  emptyStateAction?: ReactNode;
  onOpen?: (id: string) => void;
  selectedId?: string | null;
}

export default function EquipmentTable({
  equipment,
  onDelete,
  detailMode = "All",
  deploymentByEquipment = {},
  emptyStateAction,
  onOpen,
  selectedId,
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

      <table className="app-table min-w-full table-fixed">

        <thead className="sticky top-0 z-10 bg-white dark:bg-slate-900">
          <tr>

            <th className="w-[16%] px-4 py-3 text-left">
              Asset No.
            </th>

            <th className="w-[28%] px-4 py-3 text-left">
              Equipment
            </th>

            <th className="w-[20%] px-4 py-3 text-left">
              Category
            </th>

            <th className="w-[16%] px-4 py-3 text-left">
              Status
            </th>

            {(detailMode === "Assigned" || detailMode === "Deployed") && <><th className="p-3 text-left">Project</th><th className="p-3 text-left">Operator</th><th className="p-3 text-left">{detailMode === "Assigned" ? "Assignment" : "Rental / Assignment"}</th><th className="p-3 text-left">{detailMode === "Assigned" ? "Assigned Date" : "Date Deployed"}</th></>}

            <th className="w-[20%] px-4 py-3 text-right">
              Actions
            </th>

          </tr>
        </thead>

        <tbody>

          {equipment.length === 0 && <tr><td colSpan={detailMode === "Assigned" || detailMode === "Deployed" ? 9 : 5}><EmptyState icon={<PackageOpen aria-hidden="true" size={22} />} title="No equipment found" description="Add equipment to begin tracking your fleet." action={emptyStateAction} /></td></tr>}

          {equipment.map((item) => (
            <InteractiveTableRow
              key={item.id}
              onOpen={() => onOpen?.(item.id)} selected={selectedId === item.id}
              aria-label={`Open ${item.assetNo} ${item.equipmentName}`}
              className="odd:bg-slate-50/40 dark:odd:bg-slate-800/20"
            >

              <td className="px-4 py-3 align-middle">
                {item.assetNo}
              </td>

              <td className="px-4 py-3 align-middle">
                {item.equipmentName}
              </td>

              <td className="px-4 py-3 align-middle">
                {item.category}
              </td>

              <td className="px-4 py-3 align-middle whitespace-nowrap">
                <StatusBadge tone={item.status === "Available" ? "success" : item.status === "Maintenance" ? "warning" : "neutral"}>{presentEquipmentStatus(item.status)}</StatusBadge>
              </td>

              {(detailMode === "Assigned" || detailMode === "Deployed") && <><td className="p-3">{deploymentByEquipment[item.id]?.project ?? "Not linked"}</td><td className="p-3">{deploymentByEquipment[item.id]?.operator ?? "Not linked"}</td><td className="p-3">{deploymentByEquipment[item.id]?.rentalNumber ?? (deploymentByEquipment[item.id]?.hasAssignment ? "Active assignment" : "Not linked")}</td><td className="p-3">{detailMode === "Assigned" ? deploymentByEquipment[item.id]?.assignedDate ?? "—" : deploymentByEquipment[item.id]?.dateDeployed ?? "—"}</td></>}

              <td className="p-3">

                <div className="flex justify-end gap-2">

                  <Link
                    to={`/equipment/${item.id}`}
                  >
                    <Button aria-label={`View ${item.equipmentName}`} variant="ghost" size="icon">
                      <ChevronRight aria-hidden="true" size={17} />
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

            </InteractiveTableRow>
          ))}

        </tbody>

      </table>

    </div></ResponsiveTable>
  );
}
