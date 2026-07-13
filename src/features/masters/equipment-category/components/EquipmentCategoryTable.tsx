import {
    Pencil,
    Trash2,
  } from "lucide-react";
  
  import type {
    EquipmentCategoryRecord,
  } from "../types";
  
  interface Props {
  
    records: EquipmentCategoryRecord[];
  
    onEdit(
      record: EquipmentCategoryRecord,
    ): void;
  
    onDelete(
      id: string,
    ): void;
  
  }
  
  export default function EquipmentCategoryTable({
  
    records,
  
    onEdit,
  
    onDelete,
  
  }: Props) {
  
    if (records.length === 0) {
  
      return (
  
        <div className="rounded-xl border bg-white p-8 text-center text-slate-500">
  
          No Equipment Categories found.
  
        </div>
  
      );
  
    }
  
    return (
  
      <div className="overflow-hidden rounded-xl border bg-white">
  
        <table className="min-w-full">
  
          <thead className="bg-slate-100">
  
            <tr>
  
              <th className="px-4 py-3 text-left text-sm font-semibold">
  
                Equipment Category
  
              </th>
  
              <th className="px-4 py-3 text-left text-sm font-semibold">
  
                Description
  
              </th>
  
              <th className="px-4 py-3 text-center text-sm font-semibold">
  
                Active
  
              </th>
  
              <th className="px-4 py-3 text-center text-sm font-semibold">
  
                Actions
  
              </th>
  
            </tr>
  
          </thead>
  
          <tbody>
  
            {records.map(record => (
  
              <tr
  
                key={record.id}
  
                className="border-t"
  
              >
  
                <td className="px-4 py-3">
  
                  {record.category}
  
                </td>
  
                <td className="px-4 py-3">
  
                  {record.description}
  
                </td>
  
                <td className="px-4 py-3 text-center">
  
                  {record.active ? "Yes" : "No"}
  
                </td>
  
                <td className="px-4 py-3">
  
                  <div className="flex justify-center gap-2">
  
                    <button
  
                      type="button"
  
                      onClick={() =>
  
                        onEdit(record)
  
                      }
  
                      className="rounded border p-2 hover:bg-slate-100"
  
                      title="Edit"
  
                    >
  
                      <Pencil size={16} />
  
                    </button>
  
                    <button
  
                      type="button"
  
                      onClick={() =>
  
                        onDelete(record.id)
  
                      }
  
                      className="rounded border p-2 text-red-600 hover:bg-red-50"
  
                      title="Delete"
  
                    >
  
                      <Trash2 size={16} />
  
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