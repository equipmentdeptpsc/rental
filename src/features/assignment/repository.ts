import type { AssignmentRecord } from "./types";

const STORAGE_KEY = "assignments";

function load(): AssignmentRecord[] {
  const data = localStorage.getItem(STORAGE_KEY);

  if (data) {
    return JSON.parse(data);
  }

  return [];
}

let assignments = load();

function save() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(assignments)
  );
}

export const assignmentRepository = {
  getAll() {
    return assignments;
  },

  getById(id: string) {
    return assignments.find(
      (a) => a.id === id
    );
  },

  create(item: AssignmentRecord) {
    assignments.unshift(item);
    save();
  },

  update(item: AssignmentRecord) {
    assignments = assignments.map((a) =>
      a.id === item.id ? item : a
    );

    save();
  },

  delete(id: string) {
    assignments = assignments.filter(
      (a) => a.id !== id
    );

    save();
  },
};