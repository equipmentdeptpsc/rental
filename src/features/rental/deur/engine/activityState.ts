import type {
    DeurActivityLog,
    DeurActivityType,
  } from "../types";
  
  export interface ActivityState {
    shiftStarted: boolean;
  
    currentActivity?: DeurActivityType;
  
    canFinishShift: boolean;
  
    allowedActivities: DeurActivityType[];
  }
  
  const operationalActivities: DeurActivityType[] = [
    "Operation",
    "Idle",
    "Meal Break",
    "Corrective Maintenance",
    "Preventive Maintenance",
    "Demobilization",
  ];
  
  export function getActivityState(
    logs: DeurActivityLog[]
  ): ActivityState {
    if (logs.length === 0) {
      return {
        shiftStarted: false,
  
        currentActivity: undefined,
  
        canFinishShift: false,
  
        allowedActivities: [
          "Arrived at Site",
        ],
      };
    }
  
    const current =
      logs[logs.length - 1];
  
    return {
      shiftStarted: true,
  
      currentActivity:
        current.activity,
  
      canFinishShift: true,
  
      allowedActivities:
        operationalActivities,
    };
  }