import type { ProjectSnapshot } from "../model/types";

// Model -> JSON.
export function serializeProject(project: ProjectSnapshot): string {
  return JSON.stringify(project);
}
