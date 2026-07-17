import {
    useDailyOperations,
  } from "./useDailyOperations";
  
  import OperationSummaryCard from "./OperationSummaryCard";
  
  import StatusCard from "./StatusCard";
  
  import ActivityCard from "./ActivityCard";
  import CreateDeurAction from "./CreateDeurAction";
  import ActivityControls from "./controls/ActivityControls";
  import ActivityTimelineCard from "./cards/ActivityTimelineCard";
  import useTodayActivities from "./hooks/useTodayActivities";
  import DeurHoursEntry from "./DeurHoursEntry";
  
  export default function DeurPanel() {
    const summary =
      useDailyOperations();

    const activities =
      useTodayActivities();
  
    return (
      <div className="space-y-6">

        <CreateDeurAction />
  
        <OperationSummaryCard
          operatingHours={
            summary.operatingHours
          }
          idleHours={
            summary.idleHours
          }
        />
  
        <StatusCard
          status={
            summary.latestRecord?.status
          }
        />
  
        <ActivityCard
          remarks={
            summary.remarks
          }
        />

        <DeurHoursEntry />

        <ActivityControls />

        <ActivityTimelineCard
          activities={activities}
        />
  
      </div>
    );
  }
