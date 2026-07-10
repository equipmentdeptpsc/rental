import {
    createHistoryEvent,
  } from "@/features/equipment/history";
  
  export function createAssignmentReturnedHistory(
    equipmentId: string
  ) {
    return createHistoryEvent(
      equipmentId,
  
      "Assignment Ended",
  
      "Equipment returned and marked Available.",
  
      "RETURNED"
    );
  }