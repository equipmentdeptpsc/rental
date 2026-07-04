import type { AssignmentRecord } from "./types";

const STORAGE_KEY = "assignments";

function load(): AssignmentRecord[] {
  try {
    const data =
      localStorage.getItem(
        STORAGE_KEY
      );

    if (!data) return [];

    const parsed =
      JSON.parse(data);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    localStorage.removeItem(
      STORAGE_KEY
    );

    return [];
  }
}

let assignments =
  load();

function save() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(assignments)
  );
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