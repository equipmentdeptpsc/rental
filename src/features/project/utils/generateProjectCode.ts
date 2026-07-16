import type { ProjectRecord } from "../types";

export function generateProjectCode(projects: ProjectRecord[]): string {
  const highest = projects.reduce((current, project) => {
    const match = project.projectCode.match(/^PRJ-(\d+)$/i);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `PRJ-${String(highest + 1).padStart(6, "0")}`;
}
