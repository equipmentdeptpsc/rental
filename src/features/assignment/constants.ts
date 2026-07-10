export const AssignmentStatus = {
    ACTIVE: "Active",
    COMPLETED: "Completed",
  } as const;
  
  export const ASSIGNMENT_ERRORS = {
    EQUIPMENT_NOT_FOUND:
      "Equipment not found.",
  
    EQUIPMENT_ASSIGNED:
      "Equipment is already assigned.",
  
    EQUIPMENT_MAINTENANCE:
      "Equipment is under maintenance.",
  
    SUCCESS:
      "Equipment assigned successfully.",
  } as const;