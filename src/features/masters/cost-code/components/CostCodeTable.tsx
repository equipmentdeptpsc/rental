import {
    MasterStatusBadge,
  } from "@/components/master-data";
  
  import type {
    CostCodeRecord,
  } from "../types";
  
  interface Props {
  
    records: CostCodeRecord[];
  
    onEdit(
      record: CostCodeRecord
    ): void;
  
    onDelete(
      id: string
    ): void;
  
  }
  
  export default function CostCodeTable({
  
    records,
  
    onEdit,
  
    onDelete,
  
  }: Props) {
  
    if (records.length === 0) {
  
      return (
  
        <div className="rounded-xl border bg-white p-6 text-center text-slate-500">
  
          No Cost Codes found.
  
        </div>
  
      );
  
    }
  
    return (
  
      <div className="rounded-xl border bg-white overflow-hidden">
  
        <table className="min-w-full text-sm">
  
          <thead className="bg-slate-100">
  
            <tr>
  
              <th className="px-4 py-3 text-left">
                Code
              </th>
  
              <th className="px-4 py-3 text-left">
                Description
              </th>
  
              <th className="px-4 py-3 text-right">
                Default Rate
              </th>
  
              <th className="px-4 py-3 text-center">
                Unit
              </th>
  
              <th className="px-4 py-3 text-center">
                Status
              </th>
  
              <th className="px-4 py-3 text-center">
                Actions
              </th>
  
            </tr>
  
          </thead>
  
          <tbody>
  
            {records.map((item) => (
  
              <tr
                key={item.id}
                className="border-t hover:bg-slate-50"
              >
  
                <td className="px-4 py-3 font-medium">
  
                  {item.code}
  
                </td>
  
                <td className="px-4 py-3">
  
                  {item.description}
  
                </td>
  
                <td className="px-4 py-3 text-right">
  
                  {item.defaultRate.toLocaleString(
                    undefined,
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }
                  )}
  
                </td>
  
                <td className="px-4 py-3 text-center">
  
                  {item.unit}
  
                </td>
  
                <td className="px-4 py-3 text-center">
  
                  <MasterStatusBadge
                    active={item.active}
                  />
  
                </td>
  
                <td className="px-4 py-3">
  
                  <div className="flex justify-center gap-2">
  
                    <button
                      onClick={() => onEdit(item)}
                      className="rounded border px-3 py-1 text-xs hover:bg-slate-100"
                    >
  
                      Edit
  
                    </button>
  
                    <button
                      onClick={() =>
                        onDelete(item.id)
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