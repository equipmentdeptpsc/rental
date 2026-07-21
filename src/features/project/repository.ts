import { mockProjects } from "./mock";
import type { ProjectRecord } from "./types";
import type { CrudRepository } from "@/core/persistence";

const STORAGE_KEY = "projects";

function load(): ProjectRecord[] {
  const data = localStorage.getItem(STORAGE_KEY);

  if (data) {
    return JSON.parse(data);
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(mockProjects)
  );

  return mockProjects;
}

let projects = load();

function save() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(projects)
  );
}

export const projectRepository = {
  getAll() {
    return projects;
  },

  getById(id: string) {
    return projects.find(
      (p) => p.id === id
    );
  },

  create(project: ProjectRecord) {
    projects.unshift(project);
    save();
  },

  update(project: ProjectRecord) {
    projects = projects.map((p) =>
      p.id === project.id ? project : p
    );

    save();
  },

  delete(id: string) {
    projects = projects.filter(
      (p) => p.id !== id
    );

    save();
  },
} satisfies CrudRepository<ProjectRecord>;
