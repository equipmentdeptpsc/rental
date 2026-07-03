import { useEquipment } from "../context/EquipmentContext";

export default function MaintenanceDueWidget() {
  const { equipment } = useEquipment();

  const dueEquipment = equipment.filter(
    (item) => item.currentReading >= 5000
  );

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">

      <h2 className="text-lg font-semibold">
        Maintenance Due
      </h2>

      <p className="text-sm text-slate-500">
        Equipment reaching maintenance threshold
      </p>

      {dueEquipment.length === 0 ? (

        <div className="py-8 text-center text-slate-500">

          No equipment currently due.

        </div>

      ) : (

        <div className="mt-4 space-y-3">

          {dueEquipment.map((item) => (

            <div
              key={item.id}
              className="rounded border p-3"
            >

              <div className="font-semibold">
                {item.assetNo}
              </div>

              <div className="text-sm">
                {item.equipmentName}
              </div>

              <div className="text-xs text-red-600">
                Reading:
                {" "}
                {item.currentReading}
              </div>

            </div>

          ))}

        </div>

      )}

    </div>
  );
}