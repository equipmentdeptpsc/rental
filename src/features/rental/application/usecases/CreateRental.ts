import { rentalRepository } from "../../repository";

import type {
  CreateRentalRequest,
} from "../types";

export class CreateRental {
  execute({
    rental,
  }: CreateRentalRequest): void {
    rentalRepository.create(rental);
  }
}