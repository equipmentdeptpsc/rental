import type {
    TimelineEvent,
  } from "../types";
  
  interface Props {
    timeline: TimelineEvent[];
  }
  
  export default function TimelineCard({
    timeline,
  }: Props) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
  
        <h2 className="mb-4 text-xl font-semibold">
          Timeline
        </h2>
  
        {timeline.length === 0 ? (
          <div className="text-sm text-slate-500">
            No timeline available.
          </div>
        ) : (
          <div className="space-y-4">
  
            {timeline.map(item => (
  
              <div
                key={item.id}
                className="border-l-2 border-blue-500 pl-4"
              >
                <div className="text-sm font-semibold">
                  {item.description}
                </div>
  
                <div className="text-xs text-slate-500">
                  {item.dateTime}
                </div>
  
              </div>
  
            ))}
  
          </div>
        )}
  
      </div>
    );
  }