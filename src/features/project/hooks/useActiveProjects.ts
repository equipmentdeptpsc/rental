import { useMemo } from "react";

import { useProject } from "../context/ProjectContext";

export function useActiveProjects() {
  const { projects } =
    useProject();

  return useMemo(
    () =>
      projects.filter(
        (item) =>
          item.status ===
          "Active"
      ),
    [projects]
  );
}