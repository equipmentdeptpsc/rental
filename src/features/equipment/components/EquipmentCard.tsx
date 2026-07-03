import type { EquipmentRecord } from "../types";

interface Props {
  item: EquipmentRecord;
}

const statusStyles = {
  Available:
    "bg-green-50 text-green-700 ring-green-600/20",

  Assigned:
    "bg-blue-50 text-blue-700 ring-blue-600/20",

  Maintenance:
    "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
};

export default function EquipmentCard({
  item,
}: Props) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="space-y-2">

        <h3 className="font-semibold">
          {item.equipmentName}
        </h3>

        <p className="text-sm text-slate-500">
          {item.assetNo}
        </p>

        <span
          className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
            statusStyles[item.status]
          }`}
        >
          {item.status}
        </span>

      </div>
    </div>
  );
}