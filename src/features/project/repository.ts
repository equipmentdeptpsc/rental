import { mockProjects } from "./mock";
import type { ProjectRecord } from "./types";
import type { CrudRepository } from "@/core/persistence";
import { createLegacyLocalRepositoryStorage } from "@/core/persistence";

const persistence = createLegacyLocalRepositoryStorage("Project");

function load(): ProjectRecord[] {
  const data = persistence.load<ProjectRecord[]>();
  if (data) return data;
  persistence.save(mockProjects);

  return mockProjects;
}

let projects = load();

function save() {
  persistence.save(projects);
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
