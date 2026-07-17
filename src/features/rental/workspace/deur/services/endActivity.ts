import {

    EndActivityService,
  
  } from "@/features/rental/deur/services/EndActivityService";
  
  export function endActivity(
  
    rentalId: string,

    deurId?: string
  
  ) {
  
    return EndActivityService.execute(
  
      rentalId,

      deurId
  
    );
  
  }
