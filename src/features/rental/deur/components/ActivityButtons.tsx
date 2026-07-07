import type {
    DeurActivityType,
  } from "../types";
  
  interface Props {
    onSelect(
      activity: DeurActivityType
    ): void;
  }
  
  const activities: DeurActivityType[] = [
    "Arrived at Site",
    "Operation",
    "Idle",
    "Meal Break",
    "Corrective Maintenance",
    "Preventive Maintenance",
    "Demobilization",
  ];
  
  export default function ActivityButtons({
    onSelect,
  }: Props) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
  
        <h2 className="mb-2 text-lg font-semibold">
          Equipment Activity
        </h2>
  
        <p className="mb-5 text-sm text-slate-500">
          Every button automatically closes the previous activity
          and starts the selected activity.
        </p>
  
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
  
          {activities.map((activity) => (
            <button
              key={activity}
              onClick={() => onSelect(activity)}
              className="rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-700"
            >
              {activity}
            </button>
          ))}
  
        </div>
  
      </div>
    );
  }