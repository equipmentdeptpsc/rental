import type { AssignmentRecord } from "./types";

import { storage } from "@/core/storage";

const STORAGE_KEY = "assignments";

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
  storage.set(STORAGE_KEY, assignments);
}

export const assignmentRepository =
  {
    getAll() {
      return [...assignments];
    },

    getById(id: string) {
      return assignments.find(
        (a) => a.id === id
      );
    },

    create(
      assignment: AssignmentRecord
    ) {
      assignments.unshift(
        assignment
      );

      save();
    },

    update(
      assignment: AssignmentRecord
    ) {
      assignments =
        assignments.map((a) =>
          a.id === assignment.id
            ? assignment
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
      return assignments.filter(
        (a) =>
          a.status === "Active"
      );
    },
  };
