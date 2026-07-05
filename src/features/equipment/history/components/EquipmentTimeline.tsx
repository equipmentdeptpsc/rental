import {
    useEquipmentHistory,
  } from "../EquipmentHistoryContext";
  
  interface Props {
    equipmentId: string;
  }
  
  export default function EquipmentTimeline({
    equipmentId,
  }: Props) {
    const { getHistory } =
      useEquipmentHistory();
  
    const history =
      getHistory(equipmentId);
  
    if (
      history.length === 0
    ) {
      return (
        <div className="rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold mb-4">
            Equipment Timeline
          </h2>
  
          <p className="text-slate-500">
            No activity recorded.
          </p>
        </div>
      );
    }
  
    return (
      <div className="rounded-lg border bg-white p-6">
  
        <h2 className="text-lg font-semibold mb-6">
          Equipment Timeline
        </h2>
  
        <div className="space-y-5">
  
          {history.map(
            (item) => (
              <div
                key={item.id}
                className="border-l-2 border-blue-500 pl-4"
              >
                <div className="font-semibold">
                  {item.title}
                </div>
  
                <div className="text-sm text-slate-600">
                  {item.description}
                </div>
  
                <div className="text-xs text-slate-400 mt-1">
                  {new Date(
                    item.timestamp
                  ).toLocaleString()}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    );
  }