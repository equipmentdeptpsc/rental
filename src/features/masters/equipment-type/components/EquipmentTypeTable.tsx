import type {
    EquipmentTypeRecord,
  } from "../types";
  
  interface Props {
  
    records: EquipmentTypeRecord[];
  
    onEdit(
      record: EquipmentTypeRecord,
    ): void;
  
    onDelete(
      id: string,
    ): void;
  
  }
  
  export default function EquipmentTypeTable({
  
    records,
  
    onEdit,
  
    onDelete,
  
  }: Props) {
  
    if (records.length === 0) {
  
      return (
  
        <div className="rounded-xl border bg-white p-10 text-center">
  
          <div className="text-lg font-semibold text-slate-700">
  
            No Equipment Types Found
  
          </div>
  
          <p className="mt-2 text-sm text-slate-500">
  
            Click <strong>New Equipment Type</strong> to create your first
            record or import your company's Equipment Types during system
            implementation.
  
          </p>
  
        </div>
  
      );
  
    }
  
    return (
  
      <div className="overflow-hidden rounded-xl border bg-white">
  
        <table className="min-w-full text-sm">
  
          <thead className="bg-slate-100">
  
            <tr>
  
              <th className="px-4 py-3 text-left">
  
                Equipment Type
  
              </th>
  
              <th className="px-4 py-3 text-left">
  
                Description
  
              </th>
  
              <th className="px-4 py-3 text-center">
  
                Status
  
              </th>
  
              <th className="w-48 px-4 py-3 text-center">
  
                Actions
  
              </th>
  
            </tr>
  
          </thead>
  
          <tbody>
  
            {records.map((record) => (
  
              <tr
  
                key={record.id}
  
                className="border-t hover:bg-slate-50"
  
              >
  
                <td className="px-4 py-3 font-medium">
  
                  {record.equipmentType}
  
                </td>
  
                <td className="px-4 py-3">
  
                  {record.description}
  
                </td>
  
                <td className="px-4 py-3 text-center">
  
                  <span
  
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      record.active
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-200 text-slate-600"
                    }`}
  
                  >
  
                    {record.active
                      ? "Active"
                      : "Inactive"}
  
                  </span>
  
                </td>
  
                <td className="px-4 py-3">
  
                  <div className="flex justify-center gap-2">
  
                    <button
  
                      onClick={() =>
  
                        onEdit(record)
  
                      }
  
                      className="rounded border px-3 py-1 text-xs hover:bg-slate-100"
  
                    >
  
                      Edit
  
                    </button>
  
                    <button
  
                      onClick={() =>
  
                        onDelete(record.id)
  
                      }
  
                      className="rounded border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
  
                    >
  
                      Delete
  
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