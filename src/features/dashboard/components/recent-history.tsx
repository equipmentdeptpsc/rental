import type { EquipmentHistoryRecord } from "@/features/equipment/history";
import type { EquipmentRecord } from "@/features/equipment/types";

interface Props {
  history: EquipmentHistoryRecord[];
  equipment: EquipmentRecord[];
}

export default function RecentHistory({
  history,
  equipment,
}: Props) {
  function equipmentName(
    equipmentId: string
  ) {
    return (
      equipment.find(
        (e) => e.id === equipmentId
      )?.equipmentName ?? "-"
    );
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold">
          Recent Equipment Activity
        </h2>
      </div>

      <div className="divide-y">
        {history.length === 0 && (
          <div className="p-6 text-center text-gray-500">
            No recent activity.
          </div>
        )}

        {history.map((item) => (
          <div
            key={item.id}
            className="p-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">
                  {item.title}
                </div>

                <div className="text-sm text-gray-600">
                  {equipmentName(
                    item.equipmentId
                  )}
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  {item.description}
                </div>
              </div>

              <div className="text-right text-xs text-gray-500">
                <div>{item.type}</div>

                <div className="mt-1">
                  {new Date(
                    item.timestamp
                  ).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}