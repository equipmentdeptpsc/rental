import { useDeur } from "../context";

import {
  canStartDeur,
  canCompleteDeur,
} from "./DeurValidationService";

import type {
  RentalRecord,
} from "@/features/rental/types";

import type {
  DeurRecord,
} from "../types";

export function useDeurWorkflow() {

  const {

    loadSession,

    completeDay,

  } = useDeur();

  function start(

    rental: RentalRecord,

    record: DeurRecord

  ) {

    if (

      !canStartDeur(

        rental

      )

    ) {

      return {

        success: false,

        message:

          "Only released rentals can start a DEUR.",

      };

    }

    loadSession(record);

    return {

      success: true,

    };

  }

  function complete(

    rental: RentalRecord

  ) {

    if (

      !canCompleteDeur(

        rental

      )

    ) {

      return {

        success: false,

        message:

          "Rental is not eligible for DEUR completion.",

      };

    }

    completeDay();

    return {

      success: true,

    };

  }

  return {

    start,

    complete,

  };

}