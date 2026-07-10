import type { PrefixRecord } from "../types";

const STORAGE_KEY = "equipment-prefixes";

const defaultPrefixes: PrefixRecord[] = [
  {
    id: crypto.randomUUID(),
    code: "EX",
    description: "Excavator",
    nextNumber: 4,
    digits: 3,
    active: true,
  },
  {
    id: crypto.randomUUID(),
    code: "DT",
    description: "Dump Truck",
    nextNumber: 2,
    digits: 3,
    active: true,
  },
  {
    id: crypto.randomUUID(),
    code: "BD",
    description: "Bulldozer",
    nextNumber: 2,
    digits: 3,
    active: true,
  },
];

function load(): PrefixRecord[] {
  const json = localStorage.getItem(STORAGE_KEY);

  if (!json) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(defaultPrefixes)
    );

    return defaultPrefixes;
  }

  return JSON.parse(json);
}

function save(data: PrefixRecord[]) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(data)
  );
}

export const prefixRepository = {
  getAll(): PrefixRecord[] {
    return load();
  },

  get(id: string) {
    return load().find((p) => p.id === id);
  },

  create(prefix: PrefixRecord) {
    const data = load();

    data.push(prefix);

    save(data);
  },

  update(prefix: PrefixRecord) {
    const data = load();

    const index = data.findIndex(
      (p) => p.id === prefix.id
    );

    if (index >= 0) {
      data[index] = prefix;
      save(data);
    }
  },

  delete(id: string) {
    save(
      load().filter((p) => p.id !== id)
    );
  },
};