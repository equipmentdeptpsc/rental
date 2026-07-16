import ShiftSummaryCard from "./cards/ShiftSummaryCard";

import ActivityControls from "./controls/ActivityControls";

import ActivityTimelineCard from "./cards/ActivityTimelineCard";

import useTodayActivities from "./hooks/useTodayActivities";
import DeurHoursEntry from "./DeurHoursEntry";

export default function DeurWorkspace() {

  const activities =
    useTodayActivities();

  return (
    <div className="space-y-6">

      <ShiftSummaryCard />
      <DeurHoursEntry />

      <ActivityControls />

      <ActivityTimelineCard
        activities={activities}
      />

    </div>
  );

}
