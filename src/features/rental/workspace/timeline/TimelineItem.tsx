import type {
    TimelineEvent,
  } from "./types";
  
  interface Props {
    event: TimelineEvent;
  }
  
  export default function TimelineItem({
    event,
  }: Props) {
    return (
      <div className="flex gap-4">
  
        <div className="flex flex-col items-center">
  
          <div
            className={`h-3 w-3 rounded-full ${
              event.completed
                ? "bg-green-600"
                : "bg-slate-300"
            }`}
          />
  
          <div className="mt-1 h-full w-px bg-slate-200" />
  
        </div>
  
        <div className="pb-8">
  
          <div className="font-semibold">
            {event.title}
          </div>
  
          <div className="text-sm text-slate-500">
            {event.description}
          </div>
  
          <div className="mt-1 text-xs text-slate-400">
            {event.date}
          </div>
  
        </div>
  
      </div>
    );
  }