import {

    EndActivityService,
  
  } from "@/features/rental/deur/services/EndActivityService";
  
  export function endActivity(
  
    rentalId: string
  
  ) {
  
    return EndActivityService.execute(
  
      rentalId
  
    );
  
  }