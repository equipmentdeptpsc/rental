import {
    useEquipmentHistory,
  } from "../EquipmentHistoryContext";
  
  export default function RecentEquipmentActivity() {
    const { history } =
      useEquipmentHistory();
  
    return (
      <div className="rounded-lg border bg-white p-6">
  
        <h2 className="text-lg font-semibold mb-6">
          Recent Fleet Activity
        </h2>
  
        <div className="space-y-4">
  
          {history
            .slice(0, 10)
            .map((item) => (
              <div
                key={item.id}
                className="border-b pb-3"
              >
                <div className="font-medium">
                  {item.title}
                </div>
  
                <div className="text-sm text-slate-600">
                  {
                    item.description
                  }
                </div>
  
                <div className="text-xs text-slate-400">
                  {new Date(
                    item.timestamp
                  ).toLocaleString()}
                </div>
              </div>
            ))}
  
        </div>
  
      </div>
    );
  }