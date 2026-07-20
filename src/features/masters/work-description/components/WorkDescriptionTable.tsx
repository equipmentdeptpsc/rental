import type { EquipmentCategoryRecord } from "@/features/masters/equipment-category/types";
import type { WorkDescriptionRecord } from "../types";

interface Props {
  records: WorkDescriptionRecord[];
  categories: EquipmentCategoryRecord[];
  onEdit(record: WorkDescriptionRecord): void;
  onDelete(id: string): void;
  onRestore(id: string): void;
}

export default function WorkDescriptionTable({ records, categories, onEdit, onDelete, onRestore }: Props) {
  const categoryNames = new Map(categories.map((category) => [category.id, category.category]));
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-100"><tr>
          <th className="px-4 py-3 text-left">Name</th>
          <th className="px-4 py-3 text-left">Status</th>
          <th className="px-4 py-3 text-left">Operator</th>
          <th className="px-4 py-3 text-left">Remarks</th>
          <th className="px-4 py-3 text-left">Categories</th>
          <th className="px-4 py-3 text-right">Actions</th>
        </tr></thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} className="border-t">
              <td className="px-4 py-3"><div className="font-medium">{record.name}</div><div className="text-xs text-slate-500">{record.code}</div></td>
              <td className="px-4 py-3">{record.deleted ? "Deleted" : record.active ? "Active" : "Inactive"}</td>
              <td className="px-4 py-3">{record.operatorSelectable !== false ? "Selectable" : "Admin only"}</td>
              <td className="px-4 py-3">{record.requiresRemarks ? "Requires Remarks" : "Optional"}</td>
              <td className="px-4 py-3">{record.applicableEquipmentCategoryIds?.length
                ? record.applicableEquipmentCategoryIds.map((id) => categoryNames.get(id) ?? "Unknown category").join(", ")
                : "All categories"}</td>
              <td className="px-4 py-3 text-right">
                <button className="mr-2 rounded border px-3 py-1" onClick={() => onEdit(record)}>Edit</button>
                <button className="rounded border px-3 py-1" onClick={() => record.deleted ? onRestore(record.id) : onDelete(record.id)}>
                  {record.deleted ? "Restore" : "Delete"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
