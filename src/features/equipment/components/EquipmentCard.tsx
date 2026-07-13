import type { EquipmentRecord } from "../types";

import EquipmentStatusBadge from "./EquipmentStatusBadge";

interface Props {
  item: EquipmentRecord;
}

export default function EquipmentCard({
  item,
}: Props) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm transition-all hover:shadow-md">

      <div className="flex items-start justify-between">

        <div>

          <h3 className="text-lg font-semibold">
            {item.equipmentName}
          </h3>

          <div className="mt-2 space-y-1 text-sm text-slate-600">

  {item.manufacturer && (
    <div>
      <span className="font-medium">
        Manufacturer:
      </span>{" "}
      {item.manufacturer}
    </div>
  )}

  {item.model && (
    <div>
      <span className="font-medium">
        Model:
      </span>{" "}
      {item.model}
    </div>
  )}

  {item.serialNumber && (
    <div>
      <span className="font-medium">
        Serial No:
      </span>{" "}
      {item.serialNumber}
    </div>
  )}

</div>

          <p className="mt-1 text-sm text-slate-500">
            {item.assetNo}
          </p>

        </div>

        {item.plateNumber && (

<div className="text-sm text-slate-500">

  Plate No: {item.plateNumber}

</div>

)}

        <EquipmentStatusBadge
          status={item.status}
        />

      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">

        <div>

          <div className="text-slate-500">
            Category
          </div>

          <div className="font-medium">
            {item.category}
          </div>

        </div>

        <div>

          <div className="text-slate-500">
            Tracking
          </div>

          <div className="font-medium">
            {item.maintenanceType}
          </div>

        </div>

        <div>

          <div className="text-slate-500">
            Current Reading
          </div>

          <div className="font-medium">
            {item.currentReading}
          </div>

        </div>

        <div>

          <div className="text-slate-500">
            Prefix
          </div>

          <div className="font-medium">
            {item.assetNo.split("-")[0]}
          </div>

        </div>

      </div>

    </div>
  );
}