import { useNavigate } from "react-router-dom";
import EquipmentStatusBadge from "./EquipmentStatusBadge";
import Button from "@/components/ui/Button";

import type { EquipmentRecord } from "../data/equipment.mock";
import { useAuth } from "@/features/auth/AuthContext";
import { can } from "@/features/auth/role";

interface EquipmentTableProps {
  equipment: EquipmentRecord[];
  onView: (equipment: EquipmentRecord) => void;
}

export default function EquipmentTable({
  equipment,
  onView,
}: EquipmentTableProps) {
  const navigate = useNavigate();
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full">
        <thead className="bg-slate-100">
          <tr className="text-left">
            <th className="px-4 py-3">Asset No.</th>
            <th className="px-4 py-3">Equipment</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Tracking</th>
            <th className="px-4 py-3">Reading</th>
            <th className="px-4 py-3">Project</th>
            <th className="px-4 py-3">Operator</th>
            <th className="px-4 py-3 text-center">Actions</th>
          </tr>
        </thead>

        <tbody>
          {equipment.map((item) => (
            <tr key={item.id} className="border-t hover:bg-slate-50">
              <td className="px-4 py-3">{item.assetNo}</td>
              <td className="px-4 py-3">{item.equipmentName}</td>
              <td className="px-4 py-3">{item.category}</td>

              <td className="px-4 py-3">
                <EquipmentStatusBadge status={item.status} />
              </td>

              <td className="px-4 py-3">{item.maintenanceType}</td>

              <td className="px-4 py-3">
                {item.currentReading.toLocaleString()}
              </td>

              <td className="px-4 py-3">{item.project}</td>
              <td className="px-4 py-3">{item.operator}</td>

              <td className="px-4 py-3">
                <div className="flex justify-center gap-2">

                  <button
                    onClick={() => onView(item)}
                    className="rounded bg-slate-100 px-2 py-1 text-sm hover:bg-slate-200"
                  >
                    View
                  </button>

                  <Button
                    variant="secondary"
                    onClick={() =>
                      navigate(`/equipment/edit/${item.id}`)
                    }
                  >
                    Edit
                  </Button>

                  {/* 🔐 RBAC DELETE */}
                  {can(user.role, "canDelete") && (
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete ${item.equipmentName}?`
                          )
                        ) {
                          alert("Delete coming next phase");
                        }
                      }}
                    >
                      Delete
                    </Button>
                  )}

                  <button className="rounded bg-amber-100 px-2 py-1 text-sm text-amber-700 hover:bg-amber-200">
                    PMS
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}