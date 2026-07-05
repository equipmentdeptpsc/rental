import type {
    EquipmentHistoryRecord,
  } from "@/features/equipment/history";
  
  interface Props {
    history: EquipmentHistoryRecord[];
  }
  
  function actionColor(
    action: string
  ) {
    switch (action) {
      case "CREATED":
        return "bg-green-500";
  
      case "UPDATED":
        return "bg-blue-500";
  
      case "ASSIGNED":
        return "bg-indigo-500";
  
      case "MAINTENANCE":
        return "bg-amber-500";
  
      case "RENTED":
        return "bg-purple-500";
  
      case "RETURNED":
        return "bg-emerald-500";
  
      case "DELETED":
        return "bg-red-500";
  
      default:
        return "bg-slate-500";
    }
  }
  
  export default function RecentActivity({
    history,
  }: Props) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Recent Activity
          </h2>
  
          <span className="rounded bg-slate-100 px-3 py-1 text-sm">
            {history.length}
          </span>
        </div>
  
        {history.length === 0 ? (
          <div className="py-10 text-center text-slate-500">
            No recent activity.
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex gap-4"
              >
                <div
                  className={`mt-1 h-3 w-3 rounded-full ${actionColor(
                    item.type
                  )}`}
                />
  
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {item.title}
                    </div>
  
                    <div className="text-xs text-slate-500">
                      {new Date(
                        item.timestamp
                      ).toLocaleString()}
                    </div>
                  </div>
  
                  <div className="mt-1 text-sm text-slate-600">
                    {item.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }