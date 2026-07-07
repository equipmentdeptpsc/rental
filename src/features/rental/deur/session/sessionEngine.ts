import type {
    DeurActivityType,
    DeurRecord,
  } from "../types";
  
  import {
    startActivity,
    closeCurrentActivity,
  } from "../engine/activityEngine";
  
  import { updateDeurTotals } from "../calculator/durationCalculator";
  
  export function beginShift(
    record: DeurRecord
  ): DeurRecord {
    return {
      ...record,
  
      startOfDay: new Date()
        .toTimeString()
        .slice(0, 5),
  
      updatedAt:
        new Date().toISOString(),
    };
  }
  
  export function changeActivity(
    record: DeurRecord,
    activity: DeurActivityType
  ): DeurRecord {
    const updated: DeurRecord = {
      ...record,
  
      logs: startActivity(
        record.logs,
        activity
      ),
  
      updatedAt:
        new Date().toISOString(),
    };
  
    return updateDeurTotals(updated);
  }
  
  export function finishShift(
    record: DeurRecord
  ): DeurRecord {
    const updated: DeurRecord = {
      ...record,
  
      logs: closeCurrentActivity(
        record.logs
      ),
  
      endOfDay: new Date()
        .toTimeString()
        .slice(0, 5),
  
      status:
        "Pending Acknowledgement",
  
      updatedAt:
        new Date().toISOString(),
    };
  
    return updateDeurTotals(updated);
  }