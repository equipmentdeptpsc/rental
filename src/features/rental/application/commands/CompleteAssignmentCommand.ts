import { assignmentRepository } from "@/features/assignment/repository";

import type { CommandResult } from "./CommandResult";

export class CompleteAssignmentCommand {
  execute(
    rentalId: string
  ): CommandResult {
    const assignment =
      assignmentRepository
        .getAll()
        .find(
          (a) =>
            a.id === rentalId
        );

    if (!assignment) {
      return {
        success: true,
      };
    }

    assignmentRepository.update({
      ...assignment,

      status: "Completed",

      returnedDate:
        new Date()
          .toISOString()
          .substring(0, 10),
    });

    return {
      success: true,
    };
  }
}