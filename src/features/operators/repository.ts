import type { Operator } from "./types";
import { mockOperators } from "./mockData";
import type { CrudRepository } from "@/core/persistence";

const STORAGE_KEY = "operators";

function load(): Operator[] {
  const data = localStorage.getItem(STORAGE_KEY);

  if (data) {
    return JSON.parse(data);
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(mockOperators)
  );

  return mockOperators;
}

let operators = load();

function save() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(operators)
  );
}

export const operatorRepository = {
  getAll() {
    return operators;
  },

  getById(id: string) {
    return operators.find(
      (o) => o.id === id
    );
  },

  create(item: Operator) {
    operators.unshift(item);
    save();
  },

  update(item: Operator) {
    operators = operators.map((o) =>
      o.id === item.id ? item : o
    );

    save();
  },

  delete(id: string) {
    operators = operators.filter(
      (o) => o.id !== id
    );

    save();
  },
} satisfies CrudRepository<Operator>;
