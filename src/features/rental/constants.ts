export const RentalStatus = {
    ACTIVE: "Active",
    RETURNED: "Returned",
  } as const;
  
  export const RENTAL_MESSAGES = {
    CREATED:
      "Rental created successfully.",
  
    RETURNED:
      "Rental returned successfully.",
  
    EQUIPMENT_NOT_FOUND:
      "Equipment not found.",
  
    EQUIPMENT_ASSIGNED:
      "Equipment is currently assigned.",
  
    EQUIPMENT_RENTED:
      "Equipment is already rented.",
  
    EQUIPMENT_MAINTENANCE:
      "Equipment is under maintenance.",
  
    EQUIPMENT_DELETED:
      "Equipment has been deleted.",
  } as const;