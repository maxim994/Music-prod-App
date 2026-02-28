import type { ProjectSnapshot } from "../model/types";
import { serializeProject } from "./serialize";
import { deserializeProject } from "./deserialize";

// LocalStorage wrapper (single autoslot).
export class LocalProjectStore {
  private storageKey = "music-producer-app:autosave";

  save(project: ProjectSnapshot): void {
    const raw = serializeProject(project);
    localStorage.setItem(this.storageKey, raw);
  }

  load(): ProjectSnapshot | null {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      return null;
    }
    return deserializeProject(raw);
  }
}
