import React, { createContext, useContext } from "react";
import type { ProjectModel } from "../../model/types";

// Context for the current project and actions.
type ProjectContextValue = {
  project: ProjectModel | null;
};

const ProjectContext = createContext<ProjectContextValue>({ project: null });

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  return (
    <ProjectContext.Provider value={{ project: null }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext() {
  return useContext(ProjectContext);
}
