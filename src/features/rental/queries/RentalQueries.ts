import { rentalRepository } from "../repository";

import { assignmentRepository } from "@/features/assignment/repository";

import { equipmentRepository } from "@/features/equipment/repository";

import { operatorRepository } from "@/features/operators/repository";

import { projectRepository } from "@/features/project/repository";

import type { RentalRecord } from "../types";

import type { AssignmentRecord } from "@/features/assignment/types";

import type { EquipmentRecord } from "@/features/equipment/types";

import type { Operator } from "@/features/operators/types";

import type { ProjectRecord } from "@/features/project/types";

export class RentalQueries {
  static getRental(
    rentalId: string
  ): RentalRecord | undefined {
    return rentalRepository.getById(
      rentalId
    );
  }

  static getAssignment(
    rentalId: string
  ): AssignmentRecord | undefined {
    const rental =
      rentalRepository.getById(rentalId);

    if (!rental) {
      return undefined;
    }

    return assignmentRepository
      .getAll()
      .find(
        (assignment) =>
          assignment.equipmentId ===
          rental.equipmentId
      );
  }

  static getEquipment(
    equipmentId: string
  ): EquipmentRecord | undefined {
    return equipmentRepository.getById(
      equipmentId
    );
  }

  static getOperator(
    operatorId: string
  ): Operator | undefined {
    return operatorRepository.getById(
      operatorId
    );
  }

  static getProject(
    projectName: string
  ): ProjectRecord | undefined {
    return projectRepository
      .getAll()
      .find(
        (project) =>
          project.projectName ===
          projectName
      );
  }
}