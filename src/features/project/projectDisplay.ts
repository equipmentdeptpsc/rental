export interface ProjectDisplaySource {
  id: string;
  projectCode?: string;
  name?: string;
  projectName?: string;
}

export function getProjectDisplayLabel(project?: ProjectDisplaySource): string {
  if (!project) return "Project";
  const name = project.projectName?.trim() || project.name?.trim();
  const code = project.projectCode?.trim();
  if (name) return code ? `${code} - ${name}` : name;
  const shortId = project.id.replace(/-/g, "").slice(0, 6);
  return `Project ${shortId || "unavailable"}`;
}
