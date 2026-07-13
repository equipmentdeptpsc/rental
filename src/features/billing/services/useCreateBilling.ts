import { useBilling } from "../context/BillingContext";

import {
  createBilling,
} from "./CreateBillingService";

import type {
  RentalRecord,
} from "@/features/rental/types";

export function useCreateBilling() {

  const {
    addBilling
} = useBilling();

  function create(
    rental: RentalRecord
  ) {

        const billing =
      createBilling(
        rental
      );

    addBilling(
      billing
    );

    return {

      success: true,

      message:
        "Draft billing created successfully.",

      billing,

    };

  }

  return {

    create,

  };

}