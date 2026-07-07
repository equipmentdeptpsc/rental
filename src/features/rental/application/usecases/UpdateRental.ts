import { rentalRepository } from "../../repository";

import type {
  UpdateRentalRequest,
} from "../types";

export class UpdateRental {
  execute({
    rental,
  }: UpdateRentalRequest): void {
    rentalRepository.update(rental);
  }
}