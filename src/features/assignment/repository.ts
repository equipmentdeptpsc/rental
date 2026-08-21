import type { AssignmentRecord } from "./types";

import { storage } from "@/core/storage";
import type { CrudRepository } from "@/core/persistence";
import { getActiveAssignmentConflictMessage } from "./utils/selectAvailableEquipment";

const STORAGE_KEY = "assignments";
const clone = <T>(value: T): T => structuredClone(value);

function load(): AssignmentRecord[] {
  try {
    const parsed =
      storage.get<unknown>(STORAGE_KEY);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    storage.remove(STORAGE_KEY);

    return [];
  }
}

let assignments =
  load();

function save() {
  storage.set(STORAGE_KEY, clone(assignments));
}

export const assignmentRepository =
  {
    getAll() {
      return clone(assignments);
    },

    getById(id: string) {
      const found = assignments.find(
        (a) => a.id === id
      );
      return found ? clone(found) : undefined;
    },

    create(
      assignment: AssignmentRecord
    ) {
      const conflict = assignment.status === "Active" ? getActiveAssignmentConflictMessage(assignments, assignment) : undefined;
      if (conflict) throw new Error(conflict);
      assignments.unshift(
        clone(assignment)
      );

      save();
    },

    update(
      assignment: AssignmentRecord
    ) {
      const conflict = assignment.status === "Active" ? getActiveAssignmentConflictMessage(assignments, assignment, assignment.id) : undefined;
      if (conflict) throw new Error(conflict);
      assignments =
        assignments.map((a) =>
          a.id === assignment.id
            ? clone(assignment)
            : a
        );

      save();
    },

    delete(id: string) {
      assignments =
        assignments.filter(
          (a) => a.id !== id
        );

      save();
    },

    getActive() {
      return clone(assignments.filter(
        (a) =>
          a.status === "Active"
      ));
    },
  } satisfies CrudRepository<AssignmentRecord> & { getActive(): AssignmentRecord[] };
