import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
  } from "react";
  
  import type { ProjectRecord } from "../types";
  import { projectRepository } from "../repository";
  
  interface ProjectContextType {
    projects: ProjectRecord[];
  
    addProject(
      project: ProjectRecord
    ): void;
  
    updateProject(
      project: ProjectRecord
    ): void;
  
    deleteProject(id: string): void;
  }
  
  const ProjectContext =
    createContext<ProjectContextType | undefined>(
      undefined
    );
  
  export function ProjectProvider({
    children,
  }: {
    children: ReactNode;
  }) {
    const [projects, setProjects] =
      useState<ProjectRecord[]>(
        projectRepository.getAll()
      );
  
    function refresh() {
      setProjects([
        ...projectRepository.getAll(),
      ]);
    }
  
    function addProject(
      project: ProjectRecord
    ) {
      projectRepository.create(project);
      refresh();
    }
  
    function updateProject(
      project: ProjectRecord
    ) {
      projectRepository.update(project);
      refresh();
    }
  
    function deleteProject(id: string) {
      projectRepository.delete(id);
      refresh();
    }
  
    const value = useMemo(
      () => ({
        projects,
        addProject,
        updateProject,
        deleteProject,
      }),
      [projects]
    );
  
    return (
      <ProjectContext.Provider value={value}>
        {children}
      </ProjectContext.Provider>
    );
  }
  
  export function useProject() {
    const context =
      useContext(ProjectContext);
  
    if (!context) {
      throw new Error(
        "useProject must be used within ProjectProvider"
      );
    }
  
    return context;
  }