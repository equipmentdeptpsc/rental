import { rentalRepository } from "../../repository";

import type {
  CloseRentalRequest,
} from "../types";

export class CloseRental {
  execute({
    rentalId,
    actualReturn,
    remarks,
  }: CloseRentalRequest): void {
    const rental =
      rentalRepository.getById(
        rentalId
      );

    if (!rental) {
      return;
    }

    rentalRepository.update({
      ...rental,

      status: "Returned",

      actualReturn,

      remarks,
    });
  }
}