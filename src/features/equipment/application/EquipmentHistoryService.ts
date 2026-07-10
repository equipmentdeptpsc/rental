import {
    createHistoryEvent,
  } from "../history";
  
  export function assignmentHistory(
    equipmentId: string
  ) {
    return createHistoryEvent(
      equipmentId,
      "Assigned",
      "Equipment assigned to project.",
      "ASSIGNED"
    );
  }
  
  export function rentalHistory(
    equipmentId: string
  ) {
    return createHistoryEvent(
      equipmentId,
      "Rental Started",
      "Equipment rented.",
      "RENTED"
    );
  }
  
  export function rentalReturnHistory(
    equipmentId: string
  ) {
    return createHistoryEvent(
      equipmentId,
      "Rental Closed",
      "Equipment returned from rental.",
      "RENTAL_RETURN"
    );
  }
  
  export function maintenanceStartHistory(
    equipmentId: string
  ) {
    return createHistoryEvent(
      equipmentId,
      "Maintenance Started",
      "Equipment entered maintenance.",
      "MAINTENANCE_START"
    );
  }
  
  export function maintenanceEndHistory(
    equipmentId: string
  ) {
    return createHistoryEvent(
      equipmentId,
      "Maintenance Completed",
      "Equipment maintenance completed.",
      "MAINTENANCE_END"
    );
  }
  
  export function deletedHistory(
    equipmentId: string
  ) {
    return createHistoryEvent(
      equipmentId,
      "Equipment Deleted",
      "Equipment moved to Trash.",
      "STATUS_CHANGE"
    );
  }
  
  export function restoredHistory(
    equipmentId: string
  ) {
    return createHistoryEvent(
      equipmentId,
      "Equipment Restored",
      "Equipment restored from Trash.",
      "STATUS_CHANGE"
    );
  }