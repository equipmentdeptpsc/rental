interface Activity {
    id: string;
    activity: string;
    start: string;
    end?: string;
  }
  
  interface Props {
    activities: Activity[];
  }
  
  export default function ActivityTimelineCard({
    activities,
  }: Props) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
  
        <h2 className="mb-5 text-xl font-semibold">
          Today's Activity Timeline
        </h2>
  
        <div className="space-y-3">
  
          {activities.length === 0 && (
            <div className="text-sm text-slate-500">
              No activity recorded today.
            </div>
          )}
  
          {activities.map(item => (
  
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
  
              <div>
  
                <div className="font-medium">
                  {item.activity}
                </div>
  
                <div className="text-xs text-slate-500">
                  {item.start}
                  {" → "}
                  {item.end ?? "Running"}
                </div>
  
              </div>
  
            </div>
  
          ))}
  
        </div>
  
      </div>
    );
  }