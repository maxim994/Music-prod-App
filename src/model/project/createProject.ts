// Project factory placeholder.
import type { ProjectModel } from "../types";

export function createProject(): ProjectModel {
  // TODO: provide default project.
  return {
    id: "",
    name: "",
    bpm: 120,
    tracks: []
  };
}
