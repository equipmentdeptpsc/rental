import type { Operator } from "./types";
import type { CrudRepository } from "@/core/persistence";
import { createLegacyLocalRepositoryStorage } from "@/core/persistence";

const persistence = createLegacyLocalRepositoryStorage("Operator");

function load(): Operator[] {
  return persistence.load<Operator[]>() ?? [];
}

let operators = load();

function save() {
  persistence.save(operators);
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
