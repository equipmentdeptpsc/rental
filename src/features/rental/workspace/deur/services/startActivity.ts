import {

  StartActivityService,

} from "@/features/rental/deur/services/StartActivityService";

import type {

  DeurActivityType,

} from "@/features/rental/deur/types";

export interface StartActivityRequest {

  rentalId: string;

  equipmentId: string;

  operatorId: string;

  deurId?: string;

  activity: DeurActivityType;

}

export function startActivity(

  request: StartActivityRequest

) {

  return StartActivityService.execute(

    request

  );

}
