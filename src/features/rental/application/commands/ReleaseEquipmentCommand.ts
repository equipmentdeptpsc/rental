import { equipmentRepository } from "@/features/equipment/repository";

import { rentalRepository } from "@/features/rental/repository";

import type { CommandResult } from "./CommandResult";

export class ReleaseEquipmentCommand {
  execute(
    rentalId: string
  ): CommandResult {
    const rental =
      rentalRepository.getById(
        rentalId
      );

    if (!rental) {
      return {
        success: false,

        message:
          "Rental not found.",
      };
    }

    const equipment =
      equipmentRepository.getById(
        rental.equipmentId
      );

    if (!equipment) {
      return {
        success: false,

        message:
          "Equipment not found.",
      };
    }

    equipmentRepository.update({
      ...equipment,

      status: "Available",
    });

    return {
      success: true,
    };
  }
}